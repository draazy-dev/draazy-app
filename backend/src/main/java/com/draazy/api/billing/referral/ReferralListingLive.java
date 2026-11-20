package com.draazy.api.billing.referral;

import com.draazy.api.catalog.property.PropertyPublished;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

@Component
class ReferralListingLive {
    private static final Logger log = LoggerFactory.getLogger(ReferralListingLive.class);

    private final ReferralQualification qualification;
    private final TransactionTemplate fresh;

    ReferralListingLive(ReferralQualification qualification, PlatformTransactionManager transactions) {
        this.qualification = qualification;
        this.fresh = new TransactionTemplate(transactions);
        this.fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    // After commit so a failed qualification never undoes the listing's approval.
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    void onPublished(PropertyPublished event) {
        try {
            fresh.executeWithoutResult(status -> qualification.announceListingLive(event.propertyId()));
        } catch (RuntimeException e) {
            log.warn("Referral qualification on listing go-live failed for property {}", event.propertyId(), e);
        }
    }
}
