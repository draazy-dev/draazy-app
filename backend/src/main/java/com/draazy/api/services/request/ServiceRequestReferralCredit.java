package com.draazy.api.services.request;

import com.draazy.api.billing.entitlement.EntitlementService;
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

    boolean spend(ServiceRequest request) {
        if (request.isReferralCredit() || request.getPaymentRef() != null
                || !ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())
                || request.getAmount() == null) {
            return false;
        }
        requests.lockUser(request.getRequesterId());
        if (entitlements.freeAgreementsRemaining(request.getRequesterId()) < 1) {
            return false;
        }
        request.spendReferralCredit(Math.min(request.getAmount(), pricing.statutory(request.getDetails())));
        return true;
    }
}
