package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.identity.user.User;
import com.draazy.api.services.request.ServiceRequestStatus;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("A paid callback for the wrong sum or currency does not settle a service request")
class ServiceRequestAmountMismatchTest extends ServiceFixtures {

    private static final String ACTION = "serviceRequest.amountMismatch";

    private ServiceRequestStatus status(String id) {
        em.flush();
        em.clear();
        return requestRepo.findById(UUID.fromString(id)).orElseThrow().getStatus();
    }

    private int audits(String orderId) {
        return jdbc.queryForObject("select count(*) from audit_log where action = ? and entity_id = ?",
                Integer.class, ACTION, orderId);
    }

    private int notices(User admin) {
        em.flush();
        return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?",
                Integer.class, admin.getId(), "service.amount-mismatch");
    }

    private String awaiting(String buyerMobile) throws Exception {
        User buyer = customer(buyerMobile);
        return raiseUnpaid(buyer, listing(buyer));
    }

    private long billed(String id) {
        return requestRepo.findById(UUID.fromString(id)).orElseThrow().getAmount();
    }

    @Test
    @DisplayName("an underpayment leaves the request awaiting payment, audits once and tells the admins once")
    void underpaidIsNotSettled() throws Exception {
        User admin = admin("9820007001");
        String id = awaiting("9820007002");
        String order = paymentRef(id);

        deliverSigned(order, true, "1.00", "INR");
        deliverSigned(order, true, "1.00", "INR");

        assertThat(status(id)).isEqualTo(ServiceRequestStatus.AWAITING_PAYMENT);
        assertThat(audits(order)).isEqualTo(1);
        assertThat(notices(admin)).isEqualTo(1);
        jdbc.update("delete from audit_log where entity_id = ?", order);
    }

    @Test
    @DisplayName("a foreign currency is refused even when the number matches")
    void foreignCurrencyIsNotSettled() throws Exception {
        String id = awaiting("9820007003");
        String order = paymentRef(id);

        deliverSigned(order, true, billed(id) + ".00", "USD");

        assertThat(status(id)).isEqualTo(ServiceRequestStatus.AWAITING_PAYMENT);
        assertThat(audits(order)).isEqualTo(1);
        jdbc.update("delete from audit_log where entity_id = ?", order);
    }

    @Test
    @DisplayName("the exact sum, with or without a currency, settles")
    void exactSumSettles() throws Exception {
        String id = awaiting("9820007004");
        deliverSigned(paymentRef(id), true, billed(id) + ".00", "INR");
        assertThat(status(id)).isEqualTo(ServiceRequestStatus.NEW);

        String other = awaiting("9820007005");
        serviceRequests.applyWebhookOutcome(paymentRef(other), true, null, null);
        assertThat(status(other)).isEqualTo(ServiceRequestStatus.NEW);
    }

    @Test
    @DisplayName("a settled request is not undone by an odd redelivery")
    void settledRequestsAreUntouched() throws Exception {
        String id = awaiting("9820007006");
        String order = paymentRef(id);
        deliverSigned(order, true, billed(id) + ".00", "INR");

        deliverSigned(order, true, "1.00", "USD");

        assertThat(status(id)).isEqualTo(ServiceRequestStatus.NEW);
        assertThat(audits(order)).isZero();
    }
}
