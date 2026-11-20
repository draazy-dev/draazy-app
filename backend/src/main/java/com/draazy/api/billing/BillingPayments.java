package com.draazy.api.billing;

import com.draazy.api.billing.plan.SubscriptionService;
import com.draazy.api.billing.refund.ExternalRefunds;
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
    private final ExternalRefunds externalRefunds;

    public BillingPayments(SubscriptionService subscriptions, PaymentInstruments instruments,
            PaymentDisputes disputes, ExternalRefunds externalRefunds) {
        this.subscriptions = subscriptions;
        this.instruments = instruments;
        this.disputes = disputes;
        this.externalRefunds = externalRefunds;
    }

    public boolean settleOutsideRefund(String orderId, String gatewayRefund, long amount) {
        return externalRefunds.apply(orderId, gatewayRefund, amount);
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
