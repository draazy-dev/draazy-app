package com.draazy.api.billing;

import com.draazy.api.billing.plan.SubscriptionService;
import com.draazy.api.billing.refund.PaymentDisputes;
import com.draazy.api.billing.refund.PaymentInstruments;
import java.math.BigDecimal;
import java.time.Instant;
import org.springframework.stereotype.Service;

@Service
public class BillingPayments {

    private final SubscriptionService subscriptions;
    private final PaymentInstruments instruments;
    private final PaymentDisputes disputes;

    public BillingPayments(SubscriptionService subscriptions, PaymentInstruments instruments,
            PaymentDisputes disputes) {
        this.subscriptions = subscriptions;
        this.instruments = instruments;
        this.disputes = disputes;
    }

    public void recordInstrument(String orderId, String fingerprint) {
        instruments.record(orderId, fingerprint);
    }

    public void applyDispute(PaymentDisputes.Event event) {
        disputes.apply(event);
    }

    public boolean settleSubscription(String orderId, boolean paid, Instant paidAt, BigDecimal paidAmount,
            String currency) {
        return subscriptions.applyWebhookOutcome(orderId, paid, paidAt, paidAmount, currency);
    }

    public boolean settleRefund(String refundId, String status, String gatewayRef) {
        return subscriptions.applyRefundWebhook(refundId, status, gatewayRef);
    }
    }
