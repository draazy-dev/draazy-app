package com.draazy.api.billing.referral;

import com.draazy.api.common.trust.ReferralTriggers;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** The billing end of {@link ReferralTriggers}. */
@Component
class ReferralEvents implements ReferralTriggers {

    private final ReferralQualification qualification;
    private final ReferralClawbacks clawbacks;

    ReferralEvents(ReferralQualification qualification, ReferralClawbacks clawbacks) {
        this.qualification = qualification;
        this.clawbacks = clawbacks;
    }

    @Override
    public void contactAccepted(UUID requesterId, UUID ownerId, UUID propertyId, Instant at) {
        qualification.announceContactAccepted(requesterId, ownerId, propertyId, at);
    }

    @Override
    public void refereeSuspended(UUID userId) {
        clawbacks.onRefereeSuspended(userId);
    }

    @Override
    public void listingTakenDown(UUID propertyId) {
        clawbacks.onListingTakenDown(propertyId);
    }

    @Override
    public void ownershipRevoked(UUID propertyId) {
        clawbacks.onOwnershipRevoked(propertyId);
    }
}
