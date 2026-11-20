package com.draazy.api.billing.plan;

public record SubscriptionDto(
        String id,
        String planId,
        String status,
        String paymentRef,
        String paymentSessionId,
        String propertyId) {
    public static SubscriptionDto none() {
        return new SubscriptionDto(null, null, null, null, null, null);
    }

    public SubscriptionDto withPaymentSessionId(String sessionId) {
        return new SubscriptionDto(id, planId, status, paymentRef, sessionId, propertyId);
    }
}
