package com.draazy.api.services.request;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.draazy.api.billing.entitlement.EntitlementService;
import java.util.OptionalLong;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.api.Test;

class ServiceRequestReferralCreditTest {
    private final ServiceRequestRepository requests = mock(ServiceRequestRepository.class);
    private final EntitlementService entitlements = mock(EntitlementService.class);
    private final ServiceRequestPricing pricing = mock(ServiceRequestPricing.class);
    private final ServiceRequestReferralCredit credit =
            new ServiceRequestReferralCredit(requests, entitlements, pricing);

    private ServiceRequest request(long amount) {
        ServiceRequest request = new ServiceRequest(UUID.randomUUID(), ServiceRequestTypes.RENT_AGREEMENT,
                null, null, null);
        request.awaitPayment(amount);
        return request;
    }

    private void earned(int credits, int percent) {
        when(entitlements.referralCreditsRemaining(any())).thenReturn(credits);
        when(entitlements.referralDiscountPercent()).thenReturn(percent);
    }

    @ParameterizedTest(name = "total {0}, statutory {1}, {2}% off the service fee takes off {3}")
    @CsvSource({
            "1500, 1000, 50, 250",
            "1001, 0, 50, 500",
            "1000, 1000, 50, 0",
            "800, 1000, 50, 0",
            "1500, 1000, 100, 500"})
    void theDiscountIsAFlooredShareOfTheServiceFeeAndNeverTouchesTheStatutoryPart(
            long amount, long statutory, int percent, long expected) {
        ServiceRequest request = request(amount);
        when(pricing.statutory(any())).thenReturn(statutory);
        earned(1, percent);

        OptionalLong discount = credit.spend(request);

        assertThat(discount).hasValue(expected);
        assertThat(request.isReferralCredit()).isTrue();
        assertThat(request.getAmount()).isEqualTo(amount - expected);
    }

    @Test
    void withNoCreditNothingIsSpent() {
        ServiceRequest request = request(1500);
        earned(0, 50);

        assertThat(credit.spend(request)).isEmpty();
        assertThat(request.isReferralCredit()).isFalse();
        assertThat(request.getAmount()).isEqualTo(1500L);
    }

    @Test
    void aRequestThatAlreadyUsedACreditSpendsNoSecond() {
        ServiceRequest request = request(1500);
        when(pricing.statutory(any())).thenReturn(1000L);
        earned(2, 50);
        credit.spend(request);

        assertThat(credit.spend(request)).isEmpty();
        assertThat(request.getAmount()).isEqualTo(1250L);
        verify(requests, org.mockito.Mockito.times(1)).lockUser(request.getRequesterId());
        verify(requests, never()).save(any());
    }

    @Test
    void repricingAnUnpaidRequestReleasesItsCreditSoTheNewFeeIsDiscountedAgain() {
        ServiceRequest request = request(1500);
        when(pricing.statutory(any())).thenReturn(1000L);
        earned(1, 50);
        credit.spend(request);

        request.awaitPayment(1700);

        assertThat(request.isReferralCredit()).isFalse();
        assertThat(credit.spend(request)).hasValue(350L);
        assertThat(request.getAmount()).isEqualTo(1350L);
    }
}
