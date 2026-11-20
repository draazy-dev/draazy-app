package com.draazy.api.billing.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.SubscriptionSweeper;
import com.draazy.api.identity.user.User;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("A pack refunded on the Cashfree dashboard is known to the app")
class ExternalRefundTest extends RefundTestBase {

    @Autowired SubscriptionSweeper sweeper;

    private void dashboardRefund(Subscription order, String cfRefundId, long amount, String status) throws Exception {
        webhook("{\"type\":\"REFUND_STATUS_WEBHOOK\",\"data\":{\"refund\":{\"refund_id\":\"refund_" + cfRefundId
                + "\",\"cf_refund_id\":\"" + cfRefundId + "\",\"order_id\":\"" + order.getPaymentRef()
                + "\",\"refund_amount\":" + amount + ".00,\"refund_status\":\"" + status + "\"}}}");
    }

    private List<Long> creditNotes(Subscription order) {
        em.flush();
        return jdbc.queryForList("select amount from credit_notes where order_ref = ?", Long.class,
                order.getPaymentRef());
    }

    @Test
    @DisplayName("the whole price back ends the pack once, with a credit note, a notice and no second refund")
    void aFullRefundEndsThePack() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);

        dashboardRefund(pack, "cf_pending", pack.getAmount(), "PENDING");
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");

        dashboardRefund(pack, "cf_full", pack.getAmount(), "SUCCESS");
        dashboardRefund(pack, "cf_full", pack.getAmount(), "SUCCESS");

        Subscription after = subscriptionRow(pack.getId());
        assertThat(after.getStatus()).isEqualTo("refunded");
        assertThat(after.getRefundRef()).isEqualTo("cf_full");
        assertThat(after.getRefundReason()).isEqualTo("gateway_dashboard");
        assertThat(after.getRefundSettledAt()).isNotNull();
        assertThat(creditNotes(pack)).containsExactly(pack.getAmount());
        assertThat(notes(buyer, "refund.completed")).isEqualTo(1);
        assertThat((List<String>) paymentField(buyer, pack.getId(), "status")).containsExactly("refunded");

        sweeper.sendDueRefunds();
        verify(gateway, never()).refund(anyString(), anyLong(), anyString(), anyString());
    }

    @Test
    @DisplayName("part of the price back keeps the pack live and records what went back")
    void aPartialRefundKeepsThePack() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);

        dashboardRefund(pack, "cf_part", 50, "SUCCESS");

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("active");
        assertThat(creditNotes(pack)).containsExactly(50L);
        assertThat(notes(buyer, "refund.completed")).isEqualTo(1);
    }

    @Test
    @DisplayName("a refund request waiting on the desk is settled by the dashboard refund, so it cannot pay twice")
    void aWaitingRequestIsSettled() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-" + pack.getId(), null).andExpect(status().isOk());
        assertThat(subscriptionStatus(pack.getId())).isEqualTo("refund-review");

        dashboardRefund(pack, "cf_desk", pack.getAmount(), "SUCCESS");

        assertThat(subscriptionStatus(pack.getId())).isEqualTo("refunded");
        assertThat(jdbc.queryForObject("select status from refund_requests where subscription_id = ?", String.class,
                pack.getId())).isEqualTo("approved");
        decide(refundStaff(), refundRequestOf(pack.getId()), "approve", "").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("an approved refund still waiting for the sweep is not sent again once the dashboard refunded it")
    void anApprovedRefundIsNotResent() throws Exception {
        User buyer = user("buyer");
        Subscription pack = pack(buyer, 1);
        askRefund(buyer, pack.getId(), "k-" + pack.getId(), null).andExpect(status().isOk());
        decide(refundStaff(), refundRequestOf(pack.getId()), "approve", "").andExpect(status().isOk());

        dashboardRefund(pack, "cf_instead", pack.getAmount(), "SUCCESS");
        sweeper.sendDueRefunds();

        verify(gateway, never()).refund(anyString(), anyLong(), anyString(), anyString());
        assertThat(subscriptionRow(pack.getId()).getRefundRef()).isEqualTo("cf_instead");
        assertThat(subscriptionRow(pack.getId()).getRefundReason()).isEqualTo("customer_request");
        assertThat(creditNotes(pack)).containsExactly(pack.getAmount());
    }

    @Test
    @DisplayName("a second dashboard refund on an already refunded order changes nothing and tells the desk")
    void aSecondRefundAlertsTheDesk() throws Exception {
        User buyer = user("buyer");
        User desk = refundStaff();
        Subscription pack = pack(buyer, 1);
        dashboardRefund(pack, "cf_one", pack.getAmount(), "SUCCESS");

        dashboardRefund(pack, "cf_two", pack.getAmount(), "SUCCESS");

        assertThat(subscriptionRow(pack.getId()).getRefundRef()).isEqualTo("cf_one");
        assertThat(notes(buyer, "refund.completed")).isEqualTo(1);
        assertThat(jdbc.queryForList("select title from notifications where user_id = ? and type = 'refund.auto'",
                String.class, desk.getId())).contains("Second refund on one order");
    }
}
