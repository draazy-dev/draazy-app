package com.draazy.api.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.provider.CashfreePaymentGateway.Payment;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("A Cashfree order's latest attempt decides whether checkout says the payment failed")
class CashfreeLastAttemptTest {

    @Test
    @DisplayName("the newest attempt failing, dropping, voiding or cancelling is a failure")
    void newestFailedAttemptFails() {
        for (String status : new String[] {"FAILED", "USER_DROPPED", "VOID", "CANCELLED"}) {
            assertThat(CashfreePaymentGateway.newestFailed(new Payment[] {
                    new Payment("PENDING", "2026-10-19T10:00:00+05:30"),
                    new Payment(status, "2026-10-19T10:05:00+05:30")}))
                    .as(status).isTrue();
        }
    }

    @Test
    @DisplayName("a newer attempt still in flight, or any success, is not a failure")
    void newerPendingOrAnySuccessIsNot() {
        assertThat(CashfreePaymentGateway.newestFailed(new Payment[] {
                new Payment("PENDING", "2026-10-19T10:05:00+05:30"),
                new Payment("FAILED", "2026-10-19T10:00:00+05:30")})).isFalse();
        assertThat(CashfreePaymentGateway.newestFailed(new Payment[] {
                new Payment("SUCCESS", "2026-10-19T10:00:00+05:30"),
                new Payment("FAILED", "2026-10-19T10:05:00+05:30")})).isFalse();
    }

    @Test
    @DisplayName("no attempt yet, or no body, is not a failure")
    void nothingIsNotAFailure() {
        assertThat(CashfreePaymentGateway.newestFailed(new Payment[0])).isFalse();
        assertThat(CashfreePaymentGateway.newestFailed(null)).isFalse();
        assertThat(CashfreePaymentGateway.newestFailed(new Payment[] {new Payment("FAILED", null)}))
                .isTrue();
    }
}
