package com.draazy.api.services.request;

import com.draazy.api.billing.entitlement.EntitlementService;
import java.util.OptionalLong;
import org.springframework.stereotype.Service;

@Service
class ServiceRequestReferralCredit {
    private final ServiceRequestRepository requests;
    private final EntitlementService entitlements;
    private final ServiceRequestPricing pricing;

    ServiceRequestReferralCredit(ServiceRequestRepository requests, EntitlementService entitlements,
            ServiceRequestPricing pricing) {
        this.requests = requests;
        this.entitlements = entitlements;
        this.pricing = pricing;
    }

    OptionalLong spend(ServiceRequest request) {
        if (request.isReferralCredit() || request.getPaymentRef() != null
                || !ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())
                || request.getAmount() == null) {
            return OptionalLong.empty();
        }
        requests.lockUser(request.getRequesterId());
        if (entitlements.referralCreditsRemaining(request.getRequesterId()) < 1) {
            return OptionalLong.empty();
        }
        long serviceFee = Math.max(0, request.getAmount() - pricing.statutory(request.getDetails()));
        long discount = serviceFee * entitlements.referralDiscountPercent() / 100;
        request.spendReferralCredit(request.getAmount() - discount);
        return OptionalLong.of(discount);
    }
}
