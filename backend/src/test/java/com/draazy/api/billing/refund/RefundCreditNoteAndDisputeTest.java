package com.draazy.api.billing.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionSweeper;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.jayway.jsonpath.JsonPath;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("A confirmed refund earns a credit note; a dispute freezes only its own order")
class RefundCreditNoteAndDisputeTest extends RefundTestBase {

    private static final String LISTING_PASS = "b1000000-0000-4000-8000-000000000005";

    @Autowired SubscriptionSweeper sweeper;

    private void refundWebhook(Subscription order, String status) throws Exception {
        webhook("{\"type\":\"REFUND_STATUS_WEBHOOK\",\"data\":{\"refund\":{\"refund_id\":\"lp_" + order.getId().toString().replace("-", "")
                + "\",\"refund_status\":\"" + status + "\",\"cf_refund_id\":\"cf_1\",\"order_id\":\""
                + order.getPaymentRef() + "\"}}}");
    }

    private void dispute(String type, String disputeId, String status, String orderRef) throws Exception {
        webhook("{\"type\":\"" + type + "\",\"data\":{\"dispute\":{\"dispute_id\":\"" + disputeId
                + "\",\"dispute_status\":\"" + status + "\",\"dispute_amount\":199.00,"
                + "\"reason_description\":\"Customer says not received\"},\"order_details\":{\"order_id\":\""
                + orderRef + "\"}}}");
    }

    private String ref(Subscription order) {
        return order.getPaymentRef();
    }

    private Subscription approvedPackRefund(User buyer, User desk) throws Exception {
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-" + pack.getId(), null).andExpect(status().isOk());
        decide(desk, refundRequestOf(pack.getId()), "approve", "").andExpect(status().isOk());
        return subscriptionRow(pack.getId());
    }

    private String creditNoteOf(Subscription order) {
        em.flush();
        return jdbc.queryForList("select number from credit_notes where order_ref = ?", String.class, ref(order))
                .stream().findFirst().orElse(null);
    }

    @Test
    void aPaidOrderIsInvoicedOnceEvenWhenTheWebhookIsReplayed() throws Exception {
        User owner = user("owner");
        Property listing = listing(owner);
        listing.setStatus("paused");
        properties.saveAndFlush(listing);
        String body = mvc.perform(post(Routes.Plans.SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planId\":\"" + LISTING_PASS + "\",\"propertyId\":\"" + listing.getId() + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String orderId = JsonPath.read(body, "$.paymentRef");
        String paidAt = OffsetDateTime.now(ZoneId.of("Asia/Kolkata"))
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"));
        String paid = "{\"type\":\"PAYMENT_SUCCESS_WEBHOOK\",\"data\":{\"order\":{\"order_id\":\"" + orderId + "\"},"
                + "\"payment\":{\"payment_status\":\"SUCCESS\",\"payment_amount\":999.00,\"payment_time\":\"" + paidAt + "\"}}}";

        webhook(paid);
        webhook(paid);

        em.flush();
        var invoices = jdbc.queryForList("select number, amount, taxable_amount from invoices where order_ref = ?",
                orderId);
        assertThat(invoices).hasSize(1);
        assertThat((String) invoices.get(0).get("number")).matches("INV-FY\\d{4}-\\d{6}");
        assertThat(((Number) invoices.get(0).get("amount")).longValue()).isEqualTo(999);
        assertThat(((Number) invoices.get(0).get("taxable_amount")).longValue()).isEqualTo(999);
        UUID id = jdbc.queryForObject("select id from subscriptions where payment_ref = ?", UUID.class, orderId);
        assertThat((java.util.List<String>) paymentField(owner, id, "invoiceNo")).containsExactly((String) invoices.get(0).get("number"));
    }

    @Test
    void anOrderWithoutAnInvoiceShowsNoInvoiceNumber() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);
        em.flush();
        jdbc.update("delete from invoices where source_id = ?", pack.getId());

        assertThat((java.util.List<String>) paymentField(buyer, pack.getId(), "invoiceNo"))
                .allMatch(java.util.Objects::isNull);
    }

    @Test
    void aCreditNoteNamesTheInvoiceOfTheOrderItReverses() throws Exception {
        User buyer = user("buyer");
        Subscription approved = approvedPackRefund(buyer, refundStaff());
        doReturn("cf_refund_inv").when(gateway).refund(anyString(), anyLong(), anyString(), anyString());
        sweeper.sendDueRefunds();

        refundWebhook(subscriptionRow(approved.getId()), "SUCCESS");

        em.flush();
        String invoiceNo = jdbc.queryForObject("select number from invoices where source_id = ?", String.class, approved.getId());
        assertThat(jdbc.queryForObject("select invoice_no from credit_notes where order_ref = ?", String.class, ref(approved)))
                .isEqualTo(invoiceNo);
    }

    @Test
    void anApprovedRefundGetsItsCreditNoteOnlyWhenTheGatewayConfirmsIt() throws Exception {
        User buyer = user("buyer");
        Subscription approved = approvedPackRefund(buyer, refundStaff());
        doReturn("cf_refund_1").when(gateway).refund(anyString(), anyLong(), anyString(), anyString());

        assertThat(sweeper.sendDueRefunds()).isEqualTo(1);
        assertThat(creditNoteOf(approved)).isNull();
        paymentsStatusIs(buyer, approved, "refunded", null);

        refundWebhook(subscriptionRow(approved.getId()), "SUCCESS");
        refundWebhook(subscriptionRow(approved.getId()), "SUCCESS");

        String number = creditNoteOf(approved);
        assertThat(number).matches("CN-FY\\d{4}-\\d{6}");
        assertThat(jdbc.queryForObject("select count(*) from credit_notes where order_ref = ?", Long.class,
                ref(approved))).isEqualTo(1);
        var note = jdbc.queryForMap("select amount, taxable_amount from credit_notes where number = ?", number);
        assertThat(((Number) note.get("amount")).longValue()).isEqualTo(approved.getAmount());
        assertThat(((Number) note.get("taxable_amount")).longValue()).isEqualTo(approved.getAmount());
        paymentsStatusIs(buyer, approved, "refunded", number);
    }

    @Test
    void creditNoteNumbersRunOnWithinAFinancialYear() throws Exception {
        User desk = refundStaff();
        Subscription first = approvedPackRefund(user("buyer"), desk);
        Subscription second = approvedPackRefund(user("buyer"), desk);
        doReturn("cf_refund_x").when(gateway).refund(anyString(), anyLong(), anyString(), anyString());
        assertThat(sweeper.sendDueRefunds()).isEqualTo(2);
        assertThat(subscriptionRow(first.getId()).getRefundRef()).isNotNull();

        refundWebhook(subscriptionRow(first.getId()), "SUCCESS");
        refundWebhook(subscriptionRow(second.getId()), "SUCCESS");

        long a = Long.parseLong(creditNoteOf(first).substring(creditNoteOf(first).lastIndexOf('-') + 1));
        long b = Long.parseLong(creditNoteOf(second).substring(creditNoteOf(second).lastIndexOf('-') + 1));
        assertThat(b).isEqualTo(a + 1);
    }

    @Test
    void aRefundTheGatewayCancelsLeavesNoCreditNote() throws Exception {
        Subscription approved = approvedPackRefund(user("buyer"), refundStaff());
        doReturn("cf_refund_2").when(gateway).refund(anyString(), anyLong(), anyString(), anyString());
        sweeper.sendDueRefunds();

        refundWebhook(subscriptionRow(approved.getId()), "CANCELLED");

        assertThat(creditNoteOf(approved)).isNull();
    }

    @Test
    void anAutomaticRefundOfAnUninvoicedOrderTellsTheDeskAndIssuesNoCreditNote() throws Exception {
        User desk = refundStaff();
        User owner = user("owner");
        Property listing = listing(owner);
        listing.setStatus("paused");
        properties.saveAndFlush(listing);
        String body = mvc.perform(post(Routes.Plans.SUBSCRIPTION).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planId\":\"" + LISTING_PASS + "\",\"propertyId\":\"" + listing.getId() + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String orderId = JsonPath.read(body, "$.paymentRef");
        listing.setStatus("rented");
        properties.saveAndFlush(listing);
        String paidAt = OffsetDateTime.now(ZoneId.of("Asia/Kolkata"))
                .format(DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX"));
        webhook("{\"type\":\"PAYMENT_SUCCESS_WEBHOOK\",\"data\":{\"order\":{\"order_id\":\"" + orderId + "\"},"
                + "\"payment\":{\"payment_status\":\"SUCCESS\",\"payment_amount\":999.00,\"payment_time\":\"" + paidAt
                + "\",\"payment_method\":{\"card\":{\"card_number\":\"xxxxxxxxxxxx1111\"}}}}}");

        assertThat(notes(desk, "refund.auto")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select payment_instrument_hash from subscriptions where payment_ref = ?",
                String.class, orderId)).isNotBlank();
        doReturn("cf_refund_3").when(gateway).refund(anyString(), anyLong(), anyString(), anyString());
        sweeper.sendDueRefunds();
        UUID id = jdbc.queryForObject("select id from subscriptions where payment_ref = ?", UUID.class, orderId);
        refundWebhook(subscriptionRow(id), "SUCCESS");

        em.flush();
        assertThat(jdbc.queryForObject("select count(*) from invoices where order_ref = ?", Long.class, orderId))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from credit_notes where order_ref = ?", Long.class, orderId))
                .isZero();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(Routes.Refunds.DESK)
                        .param("status", "auto").header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.content[0].id").value(id.toString()))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.content[0].transaction.refundReason").value("listing_gone"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.content[0].transaction.refundState").value("confirmed"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.content[0].transaction.gatewayRefund").value("cf_refund_3"))
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.content[0].transaction.orderStatus").value("cancelled"));
    }

    @Test
    void aDisputeFreezesOnlyItsOrderAndNeverTheAccount() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription disputed = pack(buyer, 20);
        Subscription untouched = pack(buyer, 20);

        dispute("DISPUTE_CREATED", "D-1", "DISPUTE_CREATED", ref(disputed));
        dispute("DISPUTE_CREATED", "D-1", "DISPUTE_CREATED", ref(disputed));

        assertThat(subscriptionStatus(disputed.getId())).isEqualTo("disputed");
        assertThat(subscriptionStatus(untouched.getId())).isEqualTo("active");
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS * 2);
        assertThat(jdbc.queryForObject("select count(*) from payment_disputes where dispute_ref = 'D-1'", Long.class))
                .isEqualTo(1);
        assertThat(notes(desk, "refund.dispute")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select status from users where id = ?", String.class, buyer.getId()))
                .isNotEqualTo("suspended");
        assertThat((java.util.List<String>) paymentField(buyer, disputed.getId(), "status")).containsExactly("disputed");
        assertThat((java.util.List<String>) paymentField(buyer, untouched.getId(), "status")).containsExactly("paid");
    }

    @Test
    void daysNarrowsDisputesByWhenTheyWereOpened() throws Exception {
        User desk = refundStaff();
        Subscription oldOrder = pack(user("buyer"), 20);
        Subscription freshOrder = pack(user("buyer"), 20);
        dispute("DISPUTE_CREATED", "D-DAYS-OLD", "DISPUTE_CREATED", ref(oldOrder));
        dispute("DISPUTE_CREATED", "D-DAYS-NEW", "DISPUTE_CREATED", ref(freshOrder));
        Instant midnight = LocalDate.now(PlatformTime.IST).atStartOfDay(PlatformTime.IST).toInstant();
        jdbc.update("update payment_disputes set opened_at = ? where dispute_ref = 'D-DAYS-OLD'",
                Timestamp.from(midnight.minus(1, ChronoUnit.MINUTES)));

        assertThat(deskJson(desk, "1")).contains(ref(freshOrder)).doesNotContain(ref(oldOrder));
        assertThat(deskJson(desk, "7")).contains(ref(freshOrder), ref(oldOrder));
        assertThat(deskJson(desk, null)).contains(ref(freshOrder), ref(oldOrder));
    }

    private String deskJson(User desk, String days) throws Exception {
        var request = get(Routes.Refunds.DESK)
                .param("status", "disputed").param("size", "100").header(HttpHeaders.AUTHORIZATION, bearer(desk));
        if (days != null) {
            request.param("days", days);
        }
        return mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
    }

    @Test
    void aWonDisputeRestoresTheOrder() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 20);
        dispute("DISPUTE_CREATED", "D-2", "DISPUTE_CREATED", ref(pack));
        dispute("DISPUTE_UPDATED", "D-2", "DISPUTE_UNDER_REVIEW", ref(pack));
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("disputed");

        dispute("DISPUTE_CLOSED", "D-2", "DISPUTE_MERCHANT_WON", ref(pack));

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS * 2);
        assertThat(jdbc.queryForObject("select status from payment_disputes where dispute_ref = 'D-2'", String.class))
                .isEqualTo("won");
    }

    @Test
    void aLostOrAcceptedDisputeRevokesTheOrderForGood() throws Exception {
        User buyer = user("buyer");
        Subscription lost = pack(buyer, 20);
        Subscription accepted = pack(buyer, 20);
        dispute("DISPUTE_CREATED", "D-3", "DISPUTE_CREATED", ref(lost));
        dispute("DISPUTE_CREATED", "D-4", "DISPUTE_CREATED", ref(accepted));

        dispute("DISPUTE_CLOSED", "D-3", "DISPUTE_MERCHANT_LOST", ref(lost));
        dispute("DISPUTE_CLOSED", "D-4", "DISPUTE_MERCHANT_ACCEPTED", ref(accepted));

        assertThat(subscriptionStatus(lost.getId())).isEqualTo("cancelled");
        assertThat(subscriptionStatus(accepted.getId())).isEqualTo("cancelled");
        assertThat(remaining(buyer)).isEqualTo(FREE_CONTACTS);
        assertThat(jdbc.queryForObject("select status from users where id = ?", String.class, buyer.getId()))
                .isNotEqualTo("suspended");
    }

    @Test
    void anUnknownDisputeEventIsAcknowledgedAndAnIncompleteOneIgnored() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 20);
        long before = jdbc.queryForObject("select count(*) from payment_disputes", Long.class);

        webhook("{\"type\":\"DISPUTE_CREATED\",\"data\":{}}");
        webhook("{\"type\":\"DISPUTE_SOMETHING_NEW\",\"data\":{\"dispute\":{}}}");
        assertThat(jdbc.queryForObject("select count(*) from payment_disputes", Long.class)).isEqualTo(before);
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");

        webhook("{\"type\":\"DISPUTE_SOMETHING_NEW\",\"data\":{\"dispute\":{\"dispute_id\":\"D-9\"},"
                + "\"order_details\":{\"order_id\":\"" + ref(pack) + "\"}}}");
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("disputed");
    }

    @Test
    void aDisputedOrderCannotBeApprovedForARefundWhileOpen() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-1", null).andExpect(status().isOk());

        dispute("DISPUTE_CREATED", "D-5", "DISPUTE_CREATED", ref(pack));

        decide(desk, refundRequestOf(pack.getId()), "approve", "").andExpect(status().isConflict());
    }

    private void paymentsStatusIs(User buyer, Subscription order, String status, String note) throws Exception {
        assertThat((java.util.List<String>) paymentField(buyer, order.getId(), "status")).containsExactly(status);
        if (note != null) {
            assertThat((java.util.List<String>) paymentField(buyer, order.getId(), "creditNoteNo")).containsExactly(note);
        }
    }
}