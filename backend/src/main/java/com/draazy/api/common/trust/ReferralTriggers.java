package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.UUID;

public interface ReferralTriggers {
    void contactAccepted(UUID requesterId, UUID ownerId, UUID propertyId, Instant at);

    void refereeSuspended(UUID userId);

    void listingTakenDown(UUID propertyId);

    void ownershipRevoked(UUID propertyId);
}
