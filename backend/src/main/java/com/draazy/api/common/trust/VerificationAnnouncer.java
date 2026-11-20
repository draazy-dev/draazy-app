package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.UUID;

public interface VerificationAnnouncer {
    void announceOwnershipVerified(UUID ownerId, UUID propertyId, Instant verifiedAt);
}
