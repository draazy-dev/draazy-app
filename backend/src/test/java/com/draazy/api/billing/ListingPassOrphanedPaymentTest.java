package com.draazy.api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.plan.SubscriptionStatuses;
import com.draazy.api.billing.plan.SubscriptionSweeper;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.PaymentGateway;
import com.draazy.api.provider.cashfree.WebhookSignature;
import com.draazy.api.support.AbstractApiTest;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("A listing pass paid for after its listing went terminal is refunded, never granted")
class ListingPassOrphanedPaymentTest extends AbstractApiTest {

    private static final String LISTING_PASS = "b1000000-0000-4000-8000-000000000005";

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired SubscriptionRepository subscriptions;
    @Autowired WebhookSignature webhookSignature;
    @Autowired SubscriptionSweeper sweeper;
    @Autowired EntityManager em;
    @MockitoSpyBean PaymentGateway gateway;

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Orphan " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String status) {
        Property p = new Property(owner, "Orphan flat", "rent", "apartment", 25000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus(status);
        return properties.saveAndFlush(p);
    }

    private String openOrder(User u, Property p) throws Exception {
        ResultActions result = mvc.perform(post(Routes.Plans.SUBSCRIPTION)
                .header(HttpHeaders.AUTHORIZATION, bearer(u))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"planId\":\"" + LISTING_PASS + "\",\"propertyId\":\"" + p.getId() + "\"}"));
        String body = result.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.paymentRef");
    }

    private void deliverSuccess(String orderId) throws Exception {
        String paidAt = OffsetDateTime.now(ZoneId.of("Asia/Kolkata"))
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"));
        String body = "{\"type\":\"PAYMENT_SUCCESS_WEBHOOK\",\"data\":{"
                + "\"order\":{\"order_id\":\"" + orderId + "\"},"
                + "\"payment\":{\"payment_status\":\"SUCCESS\",\"payment_amount\":999.00,"
                + "\"payment_time\":\"" + paidAt + "\"}}}";
        String ts = String.valueOf(System.currentTimeMillis());
        mvc.perform(post(Routes.Webhooks.CASHFREE_PAYMENT)
                        .header("x-webhook-timestamp", ts)
                        .header("x-webhook-signature", webhookSignature.sign(ts, body))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private Map<String, Object> row(String orderId) {
        em.flush();
        return jdbc.queryForMap("select status, renews_at, refund_due_at, refund_ref from subscriptions"
                + " where payment_ref = ?", orderId);
    }

    private List<Map<String, Object>> refundNotes(User u) {
        return jdbc.queryForList("select title from notifications where user_id = ? and type = 'subscription.refund'",
                u.getId());
    }

    @Test
    @DisplayName("taking the listing down cancels its open pass order")
    void archiveCancelsTheOpenOrder() throws Exception {
        User u = owner("9871100001");
        Property p = listing(u, PropertyStatus.PAUSED);
        String orderId = openOrder(u, p);

        mvc.perform(delete("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk());

        assertThat(row(orderId).get("status")).isEqualTo(SubscriptionStatuses.CANCELLED);
        assertThat(subscriptions.findByPaymentRef(orderId).orElseThrow().getRefundDueAt()).isNull();
    }

    @Test
    @DisplayName("a payment that lands on the cancelled order grants nothing, is refunded once, and tells the owner")
    void latePaymentIsRefunded() throws Exception {
        User u = owner("9871100002");
        Property p = listing(u, PropertyStatus.PAUSED);
        String orderId = openOrder(u, p);
        mvc.perform(delete("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk());

        deliverSuccess(orderId);
        deliverSuccess(orderId);

        assertThat(row(orderId).get("refund_due_at")).isNotNull();
        assertThat(row(orderId).get("refund_ref")).isNull();
        verify(gateway, never()).refund(anyString(), anyLong(), anyString(), anyString());

        assertThat(sweeper.sendDueRefunds()).isEqualTo(1);
        assertThat(sweeper.sendDueRefunds()).isZero();

        Map<String, Object> sub = row(orderId);
        assertThat(sub.get("status")).isEqualTo(SubscriptionStatuses.CANCELLED);
        assertThat(sub.get("renews_at")).isNull();
        assertThat((String) sub.get("refund_ref")).startsWith("mock_refund_");
        verify(gateway, times(1)).refund(eq(orderId), eq(999L), eq("lp_" + subscriptionId(orderId)), anyString());
        assertThat(refundNotes(u)).hasSize(1);
        assertThat(properties.hasActivePass(p.getId(), Instant.now())).isFalse();
    }

    @Test
    @DisplayName("a still-pending order whose listing was rented out meanwhile is refunded, not activated")
    void terminalListingAtWebhookTime() throws Exception {
        User u = owner("9871100003");
        Property p = listing(u, PropertyStatus.PAUSED);
        String orderId = openOrder(u, p);
        p.setStatus(PropertyStatus.RENTED);
        properties.saveAndFlush(p);

        deliverSuccess(orderId);
        sweeper.sendDueRefunds();

        Map<String, Object> sub = row(orderId);
        assertThat(sub.get("status")).isEqualTo(SubscriptionStatuses.CANCELLED);
        assertThat((String) sub.get("refund_ref")).startsWith("mock_refund_");
        assertThat(properties.findById(p.getId()).orElseThrow().getStatus()).isEqualTo(PropertyStatus.RENTED);
    }

    @Test
    @DisplayName("a refused refund stays due, the same refund id is sent again, and the expiry sweep never calls the gateway")
    void refusedRefundIsRetried() throws Exception {
        User u = owner("9871100004");
        Property p = listing(u, PropertyStatus.PAUSED);
        String orderId = openOrder(u, p);
        mvc.perform(delete("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk());
        doThrow(new IllegalStateException("gateway down")).when(gateway).refund(anyString(), anyLong(),
                anyString(), anyString());

        deliverSuccess(orderId);
        sweeper.expireLapsed(Instant.now());

        assertThat(sweeper.sendDueRefunds()).isZero();
        assertThat(row(orderId).get("refund_due_at")).isNotNull();
        assertThat(row(orderId).get("refund_ref")).isNull();
        assertThat(refundNotes(u)).hasSize(1);

        reset(gateway);
        assertThat(sweeper.sendDueRefunds()).isEqualTo(1);

        assertThat((String) row(orderId).get("refund_ref")).startsWith("mock_refund_");
        verify(gateway, times(1)).refund(eq(orderId), eq(999L), eq("lp_" + subscriptionId(orderId)), anyString());
        assertThat(refundNotes(u)).hasSize(1);
    }

    @Test
    @DisplayName("a refund the gateway already holds is found by its id and recorded, not retried forever")
    void existingRefundIsReconciled() throws Exception {
        User u = owner("9871100005");
        String orderId = dueRefund(u);
        doThrow(new IllegalStateException("refund_id already exists")).when(gateway)
                .refund(anyString(), anyLong(), anyString(), anyString());
        doReturn(Optional.of("cf_77")).when(gateway).findRefund(eq(orderId), eq("lp_" + subscriptionId(orderId)));

        assertThat(sweeper.sendDueRefunds()).isEqualTo(1);

        assertThat(row(orderId).get("refund_ref")).isEqualTo("cf_77");
        assertThat(sweeper.sendDueRefunds()).isZero();
    }

    @Test
    @DisplayName("a refund the gateway does not hold stays due when the send is refused")
    void missingRefundStaysDue() throws Exception {
        User u = owner("9871100006");
        String orderId = dueRefund(u);
        doThrow(new IllegalStateException("gateway down")).when(gateway)
                .refund(anyString(), anyLong(), anyString(), anyString());

        assertThat(sweeper.sendDueRefunds()).isZero();

        assertThat(row(orderId).get("refund_ref")).isNull();
        assertThat(row(orderId).get("refund_due_at")).isNotNull();
    }

    @Test
    @DisplayName("a SUCCESS refund webhook records the refund the run could not")
    void refundWebhookSuccessRecords() throws Exception {
        User u = owner("9871100007");
        String orderId = dueRefund(u);

        deliverRefund(orderId, "lp_" + subscriptionId(orderId), "SUCCESS", "cf_91");

        assertThat(row(orderId).get("refund_ref")).isEqualTo("cf_91");
    }

    @Test
    @DisplayName("a FAILED refund webhook makes the money due again under a new refund id, once")
    void refundWebhookFailedReopensUnderANewId() throws Exception {
        User u = owner("9871100008");
        String orderId = dueRefund(u);
        String first = "lp_" + subscriptionId(orderId);
        assertThat(sweeper.sendDueRefunds()).isEqualTo(1);

        deliverRefund(orderId, first, "FAILED", null);
        deliverRefund(orderId, first, "FAILED", null);

        assertThat(row(orderId).get("refund_ref")).isNull();
        assertThat(jdbc.queryForObject("select refund_attempts from subscriptions where payment_ref = ?",
                Integer.class, orderId)).isEqualTo(1);

        assertThat(sweeper.sendDueRefunds()).isEqualTo(1);
        verify(gateway).refund(eq(orderId), eq(999L), eq(first + "_1"), anyString());
        assertThat((String) row(orderId).get("refund_ref")).startsWith("mock_refund_");
    }

    @Test
    @DisplayName("a refund webhook for an id that is not a pass refund is left to the other handler")
    void foreignRefundWebhookIsIgnored() throws Exception {
        User u = owner("9871100009");
        String orderId = dueRefund(u);

        deliverRefund(orderId, "lp_" + "0".repeat(32), "SUCCESS", "cf_1");
        deliverRefund(orderId, "rf_" + "0".repeat(32), "SUCCESS", "cf_2");

        assertThat(row(orderId).get("refund_ref")).isNull();
    }

    @Test
    @DisplayName("archiving versions the order it cancels, and a payment arriving after that is refunded, not activated")
    void archiveBumpsTheVersionAndTheLatePaymentIsRefunded() throws Exception {
        User u = owner("9871100010");
        Property p = listing(u, PropertyStatus.PAUSED);
        String orderId = openOrder(u, p);
        subscriptions.findByPaymentRef(orderId).orElseThrow();
        long before = version(orderId);

        mvc.perform(delete("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk());
        assertThat(version(orderId)).isGreaterThan(before);

        deliverSuccess(orderId);

        Map<String, Object> sub = row(orderId);
        assertThat(sub.get("status")).isEqualTo(SubscriptionStatuses.CANCELLED);
        assertThat(sub.get("renews_at")).isNull();
        assertThat(sub.get("refund_due_at")).isNotNull();
    }

    @Test
    @DisplayName("archiving versions an active pass it expires")
    void archiveBumpsTheVersionOfAnActivePass() throws Exception {
        User u = owner("9871100011");
        Property p = listing(u, PropertyStatus.APPROVED);
        String orderId = openOrder(u, p);
        deliverSuccess(orderId);
        assertThat(row(orderId).get("status")).isEqualTo(SubscriptionStatuses.ACTIVE);
        long before = version(orderId);

        mvc.perform(delete("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk());

        assertThat(row(orderId).get("status")).isEqualTo(SubscriptionStatuses.EXPIRED);
        assertThat(version(orderId)).isGreaterThan(before);
    }

    private long version(String orderId) {
        em.flush();
        return jdbc.queryForObject("select version from subscriptions where payment_ref = ?", Long.class, orderId);
    }

    private String dueRefund(User u) throws Exception {
        Property p = listing(u, PropertyStatus.PAUSED);
        String orderId = openOrder(u, p);
        mvc.perform(delete("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk());
        deliverSuccess(orderId);
        return orderId;
    }

    private void deliverRefund(String orderId, String refundId, String refundStatus, String cfRefundId)
            throws Exception {
        String body = "{\"type\":\"REFUND_STATUS_WEBHOOK\",\"data\":{\"refund\":{\"order_id\":\"" + orderId
                + "\",\"refund_id\":\"" + refundId + "\",\"refund_status\":\"" + refundStatus + "\""
                + (cfRefundId == null ? "" : ",\"cf_refund_id\":\"" + cfRefundId + "\"") + "}}}";
        String ts = String.valueOf(System.currentTimeMillis());
        mvc.perform(post(Routes.Webhooks.CASHFREE_PAYMENT)
                        .header("x-webhook-timestamp", ts)
                        .header("x-webhook-signature", webhookSignature.sign(ts, body))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private String subscriptionId(String orderId) {
        return subscriptions.findByPaymentRef(orderId).orElseThrow().getId().toString().replace("-", "");
    }
}
