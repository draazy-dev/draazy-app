package com.draazy.api.billing.refund;

import com.draazy.api.billing.plan.SubscriptionRepository;
import com.draazy.api.billing.referral.ReferralSignals;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Remembers, as a salted hash, which card or UPI id paid an order, so repeat refunds can be linked across accounts. */
@Service
public class PaymentInstruments {

    private final SubscriptionRepository subscriptions;
    private final ReferralSignals signals;

    public PaymentInstruments(SubscriptionRepository subscriptions, ReferralSignals signals) {
        this.subscriptions = subscriptions;
        this.signals = signals;
    }

    @Transactional
    public void record(String orderId, String fingerprint) {
        subscriptions.findByPaymentRef(orderId)
                .ifPresent(order -> order.recordInstrument(signals.instrumentHash(fingerprint)));
    }
}