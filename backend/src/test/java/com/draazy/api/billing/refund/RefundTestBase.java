package com.draazy.api.billing.refund;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.draazy.api.billing.credit.Invoices;
import com.draazy.api.billing.entitlement.EntitlementService;
import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.TestPlanGrants;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.provider.PaymentGateway;
import com.draazy.api.provider.cashfree.WebhookSignature;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

/** Fixtures for the refund-policy tests: paid passes and packs backdated to any age, staff on the refunds desk. */
abstract class RefundTestBase extends AbstractApiTest {

    static final int FREE_CONTACTS = 15;

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired TestPlanGrants grants;
    @Autowired ContactRequestRepository contactRequests;
    @Autowired EntitlementService entitlements;
    @Autowired WebhookSignature webhookSignature;
    @Autowired EntityManager em;
    @Autowired Invoices invoices;
    @MockitoSpyBean PaymentGateway gateway;

    private int seq;

    User user(String role) {
        User u = new User("9841" + String.format("%06d", ++seq), role);
        u.setName("Refund " + seq);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    User refundStaff() {
        User staff = user(Roles.Wire.STAFF);
        jdbc.update("insert into back_office_permissions (user_id, permissions) values (?::uuid, ?::jsonb)",
                staff.getId().toString(), "[\"refunds\"]");
        return staff;
    }

    User otherStaff() {
        User staff = user(Roles.Wire.STAFF);
        jdbc.update("insert into back_office_permissions (user_id, permissions) values (?::uuid, ?::jsonb)",
                staff.getId().toString(), "[\"kyc\"]");
        return staff;
    }

    Property listing(User owner) {
        Property p = new Property(owner, "Refund flat " + (++seq), "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    /** A contact pack paid {@code paidDaysAgo} days ago, with a gateway order id. */
    Subscription pack(User buyer, int paidDaysAgo) {
        Instant start = Instant.now().minus(paidDaysAgo, ChronoUnit.DAYS);
        return paid(grants.grantPack(buyer.getId(), start, start.plus(30, ChronoUnit.DAYS)), start, 30);
    }

    /** A listing pass whose listing has been live on it for {@code liveDays} days. */
    Subscription pass(User owner, Property listing, int liveDays) {
        Instant start = Instant.now().minus(liveDays, ChronoUnit.DAYS);
        return paid(grants.grantPass(owner.getId(), listing.getId(), start.plus(60, ChronoUnit.DAYS)), start, 60);
    }

    private Subscription paid(Subscription sub, Instant start, int termDays) {
        jdbc.update("update subscriptions set started_at = ?, renews_at = ?, payment_ref = ? where id = ?",
                Timestamp.from(start), Timestamp.from(start.plus(termDays, ChronoUnit.DAYS)),
                "dz_refund_" + UUID.randomUUID(), sub.getId());
        em.clear();
        Subscription order = subscriptionRow(sub.getId());
        invoices.issue(order.getUserId(), Invoices.SUBSCRIPTION, order.getId(), order.getPaymentRef(), order.getAmount(),
                order.getAmount(), start);
        return order;
    }

    Subscription subscriptionRow(UUID id) {
        em.flush();
        em.clear();
        return em.find(Subscription.class, id);
    }

    String subscriptionStatus(UUID id) {
        return jdbc.queryForObject("select status from subscriptions where id = ?", String.class, id);
    }

    /** One contact request on {@code listing}, as if made {@code daysAfter} days after {@code since}. */
    void enquiry(Property listing, Instant since, int daysAfter) {
        User seeker = user("buyer");
        ContactRequest request = contactRequests.saveAndFlush(new ContactRequest(listing.getId(), seeker.getId(), null));
        jdbc.update("update contact_requests set first_requested_at = ?, enquired_at = ?, created_at = ? where id = ?",
                Timestamp.from(since.plus(daysAfter, ChronoUnit.DAYS)), Timestamp.from(since.plus(daysAfter, ChronoUnit.DAYS)),
                Timestamp.from(Instant.now()), request.getId());
    }

    /** Uses up the buyer's free allowance, so the next contact is drawn from a pack. */
    void exhaustFreeContacts(User buyer) {
        User owner = user("owner");
        for (int i = 0; i < FREE_CONTACTS; i++) {
            contactRequests.saveAndFlush(new ContactRequest(listing(owner).getId(), buyer.getId(), null));
        }
        jdbc.update("update contact_requests set status = 'approved' where requester_id = ?", buyer.getId());
    }

    int remaining(User buyer) {
        em.flush();
        em.clear();
        return entitlements.contactsRemaining(buyer.getId()).orElseThrow();
    }

    ResultActions payments(User caller, String deviceId) throws Exception {
        var request = get(Routes.Refunds.MY_PAYMENTS).header(HttpHeaders.AUTHORIZATION, bearer(caller));
        return mvc.perform(deviceId == null ? request : request.header("X-Device-Id", deviceId));
    }

    String paymentsJson(User caller, String deviceId) throws Exception {
        return payments(caller, deviceId).andReturn().getResponse().getContentAsString();
    }

    <T> T paymentField(User caller, UUID orderId, String field) throws Exception {
        return JsonPath.read(paymentsJson(caller, null), "$[?(@.id=='" + orderId + "')]." + field + "");
    }

    ResultActions askRefund(User caller, UUID orderId, String key, String device) throws Exception {
        var request = post(Routes.Refunds.MY_REFUND, orderId).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"not needed\"}");
        if (key != null) {
            request = request.header("Idempotency-Key", key);
        }
        return mvc.perform(device == null ? request : request.header("X-Device-Id", device));
    }

    UUID refundRequestOf(UUID orderId) {
        em.flush();
        return jdbc.queryForObject("select id from refund_requests where subscription_id = ?", UUID.class, orderId);
    }

    ResultActions decide(User staff, UUID requestId, String action, String body) throws Exception {
        return mvc.perform(post("/admin/refunds/{id}/" + action, requestId)
                .header(HttpHeaders.AUTHORIZATION, bearer(staff)).contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    long notes(User user, String type) {
        return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?", Long.class,
                user.getId(), type);
    }

    void webhook(String body) throws Exception {
        String ts = String.valueOf(System.currentTimeMillis());
        mvc.perform(post(Routes.Webhooks.CASHFREE_PAYMENT).header("x-webhook-timestamp", ts)
                        .header("x-webhook-signature", webhookSignature.sign(ts, body))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
    }
}