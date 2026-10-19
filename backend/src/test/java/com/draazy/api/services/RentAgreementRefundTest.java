package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

// Everything paid comes back until GRAS duty is paid; after that only the service fee can refund.
// A second operator must approve so no refund leaves on one person's word.
@DisplayName("Rent agreement refunds — one operator asks, a second approves, within what D-b allows")
class RentAgreementRefundTest extends ServiceFixtures {

    private static final String TERMS = "{\"type\":\"rent-agreement\",\"details\":{\"rent\":20000,"
            + "\"deposit\":60000,\"months\":11,\"_state\":{\"prop\":{\"gramPanchayat\":false},\"terms\":{\"rent\":\"20000\",\"deposit\":\"60000\","
            + "\"months\":\"11\"}}}}";

    private static final long STATUTORY = 600 + 1000 + 300;

    private static final String GRN = "MH012345678901234567E";

    private String raiseWithTerms(User owner) throws Exception {
        String json = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content(TERMS))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        String id = field(json, "id");
        serviceRequests.applyWebhookOutcome(paymentRef(id), true, null, null);
        return id;
    }

    private long paid(String id) {
        return requestRepo.findById(UUID.fromString(id)).orElseThrow().getAmount();
    }

    private ResultActions summary(User caller, String id) throws Exception {
        em.flush();
        em.clear();
        return mvc.perform(get(Routes.ServiceRequests.REFUNDS, id).header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    private ResultActions ask(User caller, String id, long amount, boolean dutyPaid, String grn) throws Exception {
        String body = "{\"amount\":" + amount + ",\"dutyPaid\":" + dutyPaid
                + (grn == null ? "" : ",\"grn\":\"" + grn + "\"") + ",\"reason\":\"Customer cancelled before the visit\"}";
        return mvc.perform(post(Routes.ServiceRequests.REFUNDS, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions decideRefund(User caller, String id, String refundId, boolean approve) throws Exception {
        return mvc.perform(post(approve ? Routes.ServiceRequests.REFUND_APPROVE : Routes.ServiceRequests.REFUND_REJECT,
                        id, refundId)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Checked against the GRAS receipt\"}"));
    }

    private String openRefund(User caller, String id) throws Exception {
        String json = summary(caller, id).andReturn().getResponse().getContentAsString();
        return field(json.substring(json.indexOf("\"refunds\"")), "id");
    }

    @Test
    @DisplayName("before the duty is paid the whole charge comes back, once, and only on a second operator's approval")
    void fullRefundBeforeTheDuty() throws Exception {
        User owner = customer("9820009001");
        User maker = staff("9820009002", Teams.RENTAL);
        User checker = staff("9820009003", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        setStatus(maker, id, "assigned", 200);
        long paid = paid(id);

        summary(maker, id).andExpect(status().isOk())
                .andExpect(jsonPath("$.paid").value(paid))
                .andExpect(jsonPath("$.refunded").value(0))
                .andExpect(jsonPath("$.refundableBeforeDuty").value(paid))
                .andExpect(jsonPath("$.refundableAfterDuty").value(paid - STATUTORY))
                .andExpect(jsonPath("$.dutyPaidOnRecord").value(false));

        ask(maker, id, paid + 1, false, null).andExpect(status().isUnprocessableEntity());
        ask(checker, id, paid, false, null).andExpect(status().isConflict());
        ask(maker, id, paid, false, null).andExpect(status().isCreated())
                .andExpect(jsonPath("$.refunds[0].status").value("requested"))
                .andExpect(jsonPath("$.refunds[0].amount").value(paid))
                .andExpect(jsonPath("$.refunds[0].mine").value(true));
        ask(maker, id, 100, false, null).andExpect(status().isConflict());

        String refund = openRefund(checker, id);
        decideRefund(maker, id, refund, true).andExpect(status().isForbidden());
        decideRefund(checker, id, refund, true).andExpect(status().isOk())
                .andExpect(jsonPath("$.refunds[0].status").value("approved"))
                .andExpect(jsonPath("$.refunds[0].gatewayRefundId", startsWith("mock_refund_")))
                .andExpect(jsonPath("$.refunded").value(paid))
                .andExpect(jsonPath("$.refundableBeforeDuty").value(0));
        decideRefund(checker, id, refund, true).andExpect(status().isConflict());
        decideRefund(checker, id, UUID.randomUUID().toString(), true).andExpect(status().isNotFound());
        ask(maker, id, 1, false, null).andExpect(status().isUnprocessableEntity());

        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.timeline[*].event", hasItem("refund.approved")));
        assertThat(jdbc.queryForMap("select title, link from notifications where user_id = ? and type = ?",
                owner.getId(), "service.refund-approved"))
                .containsEntry("title", Notifier.rupees(paid) + " refund on its way")
                .containsEntry("link", "/services/rent-agreement");
    }

    @Test
    @DisplayName("once the duty is paid only the service fee comes back, and the maker names the GRAS challan")
    void serviceFeeOnlyAfterTheDuty() throws Exception {
        User owner = customer("9820009011");
        User maker = staff("9820009012", Teams.RENTAL);
        User checker = staff("9820009013", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        setStatus(maker, id, "assigned", 200);
        long fee = paid(id) - STATUTORY;

        ask(maker, id, fee, true, null).andExpect(status().isUnprocessableEntity());
        ask(maker, id, fee, true, "12345").andExpect(status().isUnprocessableEntity());
        ask(maker, id, fee + 1, true, GRN).andExpect(status().isUnprocessableEntity());
        ask(maker, id, fee, true, GRN).andExpect(status().isCreated())
                .andExpect(jsonPath("$.refunds[0].dutyPaid").value(true))
                .andExpect(jsonPath("$.refunds[0].grn").value(GRN));

        decideRefund(checker, id, openRefund(checker, id), false).andExpect(status().isOk())
                .andExpect(jsonPath("$.refunds[0].status").value("rejected"))
                .andExpect(jsonPath("$.refunded").value(0));
        ask(maker, id, fee, true, GRN).andExpect(status().isCreated());
    }

    private String approvedRefund(User maker, User checker, String id, long amount) throws Exception {
        ask(maker, id, amount, false, null).andExpect(status().isCreated());
        String refund = openRefund(checker, id);
        decideRefund(checker, id, refund, true).andExpect(status().isOk());
        return refund;
    }

    @Test
    @DisplayName("a refund of everything paid closes the request; a partial one leaves it open")
    void aFullRefundClosesTheRequest() throws Exception {
        User owner = customer("9820009041");
        User maker = staff("9820009042", Teams.RENTAL);
        User checker = staff("9820009043", Teams.RENTAL);
        String partial = raiseWithTerms(owner);
        String full = raiseWithTerms(owner);
        setStatus(maker, partial, "assigned", 200);
        setStatus(maker, full, "assigned", 200);

        approvedRefund(maker, checker, partial, 500);
        expectStatus(owner, partial, "assigned");

        approvedRefund(maker, checker, full, paid(full));
        expectStatus(owner, full, "cancelled");
        mvc.perform(get(Routes.ServiceRequests.BY_ID, full).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.timeline[*].event", hasItem("refund.cancelled-request")));
        assertThat(jdbc.queryForMap("select title from notifications where user_id = ? and type = ?",
                owner.getId(), "service.refund-cancelled")).containsEntry("title", "Request cancelled");
    }

    @Test
    @DisplayName("the gateway's refund webhook reopens a cancelled refund once, and ignores success and strangers")
    void theRefundWebhookReportsWhatTheGatewayDid() throws Exception {
        User owner = customer("9820009051");
        User maker = staff("9820009052", Teams.RENTAL);
        User checker = staff("9820009053", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        setStatus(maker, id, "assigned", 200);
        long paid = paid(id);
        String merchantId = "rf_" + approvedRefund(maker, checker, id, 500).replace("-", "");

        deliverRefundSigned(merchantId, "SUCCESS");
        deliverRefundSigned("rf_00000000000000000000000000000000", "CANCELLED");
        deliverRefundSigned("not-ours", "CANCELLED");
        summary(maker, id).andExpect(jsonPath("$.refunds[0].status").value("approved"))
                .andExpect(jsonPath("$.refunded").value(500));

        deliverRefundSigned(merchantId, "CANCELLED");
        deliverRefundSigned(merchantId, "CANCELLED");
        summary(maker, id).andExpect(jsonPath("$.refunds[0].status").value("failed"))
                .andExpect(jsonPath("$.refunded").value(0))
                .andExpect(jsonPath("$.refundableBeforeDuty").value(paid));
        mvc.perform(get(Routes.ServiceRequests.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.timeline[?(@.event == 'refund.failed')]", org.hamcrest.Matchers.hasSize(1)));
        assertThat(jdbc.queryForList("select 1 from notifications where user_id = ? and type = ?",
                maker.getId(), "service.refund-failed")).hasSize(1);

        ask(maker, id, 500, false, null).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a registered agreement has paid its duty, whatever the maker says")
    void registrationProvesTheDutyPaid() throws Exception {
        User owner = customer("9820009021");
        User maker = staff("9820009022", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        setStatus(maker, id, "assigned", 200);
        shareDraft(maker, id, 200);
        openDraft(owner, id, 204);
        decide(owner, id, "approve", 200);
        finalDoc(maker, id, 201);
        long paid = paid(id);

        summary(maker, id).andExpect(jsonPath("$.dutyPaidOnRecord").value(true));
        ask(maker, id, paid, false, null).andExpect(status().isUnprocessableEntity());
        ask(maker, id, paid - STATUTORY, false, null).andExpect(status().isCreated())
                .andExpect(jsonPath("$.refunds[0].dutyPaid").value(true))
                .andExpect(jsonPath("$.refunds[0].grn", startsWith("MH")));
    }

    @Test
    @DisplayName("customers, other desks and unpaid requests are refused")
    void refusals() throws Exception {
        User owner = customer("9820009031");
        User legal = staff("9820009032", Teams.LEGAL);
        User maker = staff("9820009033", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        setStatus(maker, id, "assigned", 200);

        ask(owner, id, 100, false, null).andExpect(status().isForbidden());
        summary(owner, id).andExpect(status().isForbidden());
        ask(legal, id, 100, false, null).andExpect(status().isForbidden());

        String unpaid = raiseUnpaid(owner, listing(owner));
        ask(admin("9820009034"), unpaid, 100, false, null).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("a refund made on the Cashfree dashboard enters the ledger once, and the whole sum closes the request")
    void aDashboardRefundEntersTheLedger() throws Exception {
        User owner = customer("9820009201");
        User maker = staff("9820009202", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        setStatus(maker, id, "assigned", 200);
        long paid = paid(id);
        String order = requestRepo.findById(UUID.fromString(id)).orElseThrow().getPaymentRef();

        deliverDashboardRefund(order, "cf_dash_pending", 500, "PENDING");
        summary(maker, id).andExpect(jsonPath("$.refunded").value(0));

        deliverDashboardRefund(order, "cf_dash_1", 500, "SUCCESS");
        deliverDashboardRefund(order, "cf_dash_1", 500, "SUCCESS");
        summary(maker, id).andExpect(jsonPath("$.refunded").value(500))
                .andExpect(jsonPath("$.refunds.length()").value(1))
                .andExpect(jsonPath("$.refunds[0].status").value("approved"))
                .andExpect(jsonPath("$.refunds[0].gatewayRefundId").value("cf_dash_1"))
                .andExpect(jsonPath("$.refundableBeforeDuty").value(paid - 500));
        expectStatus(owner, id, "assigned");
        assertThat(jdbc.queryForList("select amount from credit_notes where source_type = 'service_request_refund'"
                + " and user_id = ?", Long.class, owner.getId())).containsExactly(500L);

        deliverDashboardRefund(order, "cf_dash_2", paid - 500, "SUCCESS");
        expectStatus(owner, id, "cancelled");
        assertThat(jdbc.queryForList("select 1 from notifications where user_id = ? and type = ?",
                owner.getId(), "service.refund-approved")).hasSize(2);
    }

    @Test
    @DisplayName("a paid checkout is invoiced once, only the platform fee counted as taxable, and the credit note cites it")
    void aPaidCheckoutIsInvoicedAndItsCreditNoteCitesTheInvoice() throws Exception {
        User owner = customer("9820009071");
        User maker = staff("9820009072", Teams.RENTAL);
        User checker = staff("9820009073", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        serviceRequests.applyWebhookOutcome(paymentRef(id), true, null, null);
        em.flush();

        var invoices = jdbc.queryForList("select number, amount, taxable_amount from invoices"
                + " where source_type = 'service_request' and source_id = ?", UUID.fromString(id));
        assertThat(invoices).hasSize(1);
        String number = (String) invoices.get(0).get("number");
        assertThat(number).matches("INV-FY\\d{4}-\\d{6}");
        assertThat(((Number) invoices.get(0).get("amount")).longValue()).isEqualTo(paid(id));
        long taxed = ((Number) invoices.get(0).get("taxable_amount")).longValue();
        assertThat(taxed).isPositive().isLessThan(paid(id));

        setStatus(maker, id, "assigned", 200);
        String merchantId = "rf_" + approvedRefund(maker, checker, id, 500).replace("-", "");
        deliverRefundSigned(merchantId, "SUCCESS");
        em.flush();
        assertThat(jdbc.queryForObject("select invoice_no from credit_notes where user_id = ?", String.class, owner.getId()))
                .isEqualTo(number);
        em.clear();
        mvc.perform(get(Routes.Refunds.MY_PAYMENTS).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$[0].invoiceNo").value(number));
    }

    @Test
    @DisplayName("a confirmed refund is a credit note on the platform fee only, and shows in /me/payments")
    void aConfirmedRefundIssuesACreditNote() throws Exception {
        User owner = customer("9820009061");
        User maker = staff("9820009062", Teams.RENTAL);
        User checker = staff("9820009063", Teams.RENTAL);
        String id = raiseWithTerms(owner);
        setStatus(maker, id, "assigned", 200);
        String merchantId = "rf_" + approvedRefund(maker, checker, id, 500).replace("-", "");
        em.flush();
        em.clear();
        mvc.perform(get(Routes.Refunds.MY_PAYMENTS).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$[0].kind").value("rent_agreement"))
                .andExpect(jsonPath("$[0].serviceRequestId").value(id))
                .andExpect(jsonPath("$[0].status").value("refund_pending"))
                .andExpect(jsonPath("$[0].creditNoteNo").doesNotExist());

        deliverRefundSigned(merchantId, "SUCCESS");
        deliverRefundSigned(merchantId, "SUCCESS");
        em.flush();

        var notes = jdbc.queryForList("select number, amount, taxable_amount from credit_notes"
                + " where source_type = 'service_request_refund' and user_id = ?", owner.getId());
        assertThat(notes).hasSize(1);
        assertThat(((Number) notes.get(0).get("amount")).longValue()).isEqualTo(500);
        assertThat(((Number) notes.get(0).get("taxable_amount")).longValue()).isPositive().isLessThanOrEqualTo(500);
        em.clear();
        mvc.perform(get(Routes.Refunds.MY_PAYMENTS).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$[0].status").value("refunded"))
                .andExpect(jsonPath("$[0].creditNoteNo").value(notes.get(0).get("number")));
    }}
