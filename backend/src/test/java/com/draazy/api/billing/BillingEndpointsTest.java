package com.draazy.api.billing;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.billing.plan.TestPlanGrants;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.cashfree.WebhookSignature;
import com.draazy.api.security.JwtService;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** The four properties a bug here costs money on: the price lists are public and non-empty, only
 *  the signed webhook may write {@code active}, a retry does not buy twice, a boost is owner-scoped. */
class BillingEndpointsTest extends AbstractApiTest {

    private static final String LISTING_PASS = "b1000000-0000-4000-8000-000000000005";

    private static final String CONTACT_PACK = "b1000000-0000-4000-8000-000000000006";

    @Autowired MockMvc mvc;
    @Autowired JwtService jwtService;
    @Autowired UserRepository users;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired WebhookSignature webhookSignature;
    @Autowired TestPlanGrants grants;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Billing User " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private void deliverSigned(String orderId, String status) throws Exception {
        deliverSigned(orderId, status, "199.00", "INR");
    }

    private void deliverSigned(String orderId, String status, String amount, String currency) throws Exception {
        String paidAt = java.time.OffsetDateTime.now(java.time.ZoneId.of("Asia/Kolkata"))
                .format(java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"));
        String body = "{\"type\":\"PAYMENT_SUCCESS_WEBHOOK\",\"data\":{"
                + "\"order\":{\"order_id\":\"" + orderId + "\"},"
                + "\"payment\":{\"payment_status\":\"" + status + "\","
                + "\"payment_amount\":" + amount + ",\"payment_currency\":\"" + currency + "\","
                + "\"payment_time\":\"" + paidAt + "\"}}}";
        String ts = String.valueOf(System.currentTimeMillis());
        mvc.perform(post(Routes.Webhooks.CASHFREE_PAYMENT)
                        .header("x-webhook-timestamp", ts)
                        .header("x-webhook-signature", webhookSignature.sign(ts, body))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private static String jsonField(String body, String field) {
        int i = body.indexOf("\"" + field + "\":\"") + field.length() + 4;
        return body.substring(i, body.indexOf('"', i));
    }

    @Test
    void thePriceListsAreReadableWithoutAToken() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.plans.length()", Matchers.greaterThanOrEqualTo(2)))
                .andExpect(jsonPath("$.plans[?(@.id=='" + LISTING_PASS + "')].price").value(
                        Matchers.hasItem(999)))
                .andExpect(jsonPath("$.plans[?(@.id=='" + LISTING_PASS + "')].kind").value(
                        Matchers.hasItem("listing-pass")))
                .andExpect(jsonPath("$.plans[?(@.id=='" + LISTING_PASS + "')].termDays").value(
                        Matchers.hasItem(60)))
                .andExpect(jsonPath("$.plans[?(@.id=='" + CONTACT_PACK + "')].contactLimit").value(
                        Matchers.hasItem(15)))
                .andExpect(jsonPath("$.plans[?(@.id=='" + CONTACT_PACK + "')].termDays").value(
                        Matchers.hasItem(30)));
    }

    @Test
    void aPricedPackIsPendingUntilTheWebhookConfirms() throws Exception {
        User u = user("9855500002", "owner");

        String created = mvc.perform(post(Routes.Plans.SUBSCRIPTION)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planId\":\"" + CONTACT_PACK + "\",\"paymentMethod\":\"upi\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value(SubscriptionStatuses.PENDING))
                .andExpect(jsonPath("$.paymentRef").value(Matchers.notNullValue()))
                .andExpect(jsonPath("$.renewsAt").doesNotExist())
                .andExpect(jsonPath("$.startedAt").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        // With nothing else held, the pending order is still reported so the checkout can be
        // resumed — but it is reported as pending, never as an entitlement.
        mvc.perform(get(Routes.Plans.SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(SubscriptionStatuses.PENDING))
                .andExpect(jsonPath("$.paymentRef").doesNotExist());

        String orderId = jsonField(created, "paymentRef");
        deliverSigned(orderId, "SUCCESS");

        mvc.perform(get(Routes.Plans.SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planId").value(CONTACT_PACK))
                .andExpect(jsonPath("$.status").value(SubscriptionStatuses.ACTIVE))
                .andExpect(jsonPath("$.renewsAt").doesNotExist());

        // A redelivery of the same event must not move it again or extend the term.
        var renewsAt = subscriptions.findByPaymentRef(orderId).orElseThrow().getRenewsAt();
        assertThat(renewsAt).isAfter(Instant.now().plus(29, ChronoUnit.DAYS))
                .isBefore(Instant.now().plus(31, ChronoUnit.DAYS));
        deliverSigned(orderId, "SUCCESS");
        assertThat(subscriptions.findByPaymentRef(orderId).orElseThrow().getRenewsAt())
                .isEqualTo(renewsAt);
    }

    /** A second pack bought while one is held is a new order beside it, never a replacement. */
    @Test
    void anAbandonedSecondPackDoesNotHideThePackAlreadyHeld() throws Exception {
        User u = user("9855500003", "owner");
        String auth = bearer(u);
        Subscription held = grants.grantPack(u.getId(), Instant.now(), Instant.now().plus(30, ChronoUnit.DAYS));

        mvc.perform(post(Routes.Plans.SUBSCRIPTION)
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planId\":\"" + CONTACT_PACK + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value(SubscriptionStatuses.PENDING));

        mvc.perform(get(Routes.Plans.SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.planId").value(CONTACT_PACK))
                .andExpect(jsonPath("$.status").value(SubscriptionStatuses.ACTIVE));
        assertThat(subscriptions.findById(held.getId()).orElseThrow().getStatus())
                .isEqualTo(SubscriptionStatuses.ACTIVE);
    }

    @Test
    void anUnderpaidSuccessGrantsNothingAndIsMarkedForRefund() throws Exception {
        User u = user("9855500006", "owner");
        String orderId = orderFor(u);

        deliverSigned(orderId, "SUCCESS", "1.00", "INR");

        Subscription order = subscriptions.findByPaymentRef(orderId).orElseThrow();
        assertThat(order.getStatus()).isEqualTo(SubscriptionStatuses.CANCELLED);
        assertThat(order.getRenewsAt()).isNull();
        assertThat(order.getRefundDueAt()).isNotNull();
        assertThat(order.getRefundAmount()).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = ? and entity_id = ?",
                Integer.class, "subscription.amountMismatch", order.getId().toString())).isEqualTo(1);

        deliverSigned(orderId, "SUCCESS", "1.00", "INR");
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = ? and entity_id = ?",
                Integer.class, "subscription.amountMismatch", order.getId().toString())).isEqualTo(1);
        jdbc.update("delete from audit_log where entity_id = ?", order.getId().toString());
    }

    @Test
    void aForeignCurrencyIsNotTakenAsTheOrderAmount() throws Exception {
        User u = user("9855500007", "owner");
        String orderId = orderFor(u);

        deliverSigned(orderId, "SUCCESS", "199.00", "USD");

        Subscription order = subscriptions.findByPaymentRef(orderId).orElseThrow();
        assertThat(order.getStatus()).isEqualTo(SubscriptionStatuses.CANCELLED);
        assertThat(order.getRefundDueAt()).isNotNull();
        jdbc.update("delete from audit_log where entity_id = ?", order.getId().toString());
    }

    @Test
    void aSettledPackIsNotCancelledByAnOddRedelivery() throws Exception {
        User u = user("9855500008", "owner");
        String orderId = orderFor(u);
        deliverSigned(orderId, "SUCCESS");

        deliverSigned(orderId, "SUCCESS", "1.00", "INR");

        Subscription order = subscriptions.findByPaymentRef(orderId).orElseThrow();
        assertThat(order.getStatus()).isEqualTo(SubscriptionStatuses.ACTIVE);
        assertThat(order.getRefundDueAt()).isNull();
    }

    @Test
    void aPaymentLandingAfterTheUserCancelledIsRefundedNotLost() throws Exception {
        User u = user("9855500009", "owner");
        String orderId = orderFor(u);
        mvc.perform(post(Routes.Plans.CANCEL_SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isNoContent());

        deliverSigned(orderId, "SUCCESS");
        deliverSigned(orderId, "SUCCESS");

        Subscription order = subscriptions.findByPaymentRef(orderId).orElseThrow();
        assertThat(order.getStatus()).isEqualTo(SubscriptionStatuses.CANCELLED);
        assertThat(order.getRefundDueAt()).isNotNull();
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = ? and entity_id = ?",
                Integer.class, "subscription.passRefundDue", order.getId().toString())).isEqualTo(1);
        jdbc.update("delete from audit_log where entity_id = ?", order.getId().toString());
    }

    private String orderFor(User u) throws Exception {
        String created = mvc.perform(post(Routes.Plans.SUBSCRIPTION)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planId\":\"" + CONTACT_PACK + "\",\"paymentMethod\":\"upi\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return jsonField(created, "paymentRef");
    }

    @Test
    void anUnknownPlanIsNotFound() throws Exception {
        User u = user("9855500005", "owner");
        mvc.perform(post(Routes.Plans.SUBSCRIPTION)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planId\":\"not-a-plan\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void buyingAnythingRequiresTheCaller() throws Exception {
        mvc.perform(get(Routes.Plans.SUBSCRIPTION)).andExpect(status().isUnauthorized());
    }
}
