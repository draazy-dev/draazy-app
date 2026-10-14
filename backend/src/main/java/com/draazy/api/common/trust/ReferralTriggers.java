package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.UUID;

/** Events the referral scheme reacts to, announced by contexts that must not know billing exists. */
public interface ReferralTriggers {

    /** {@code ownerId} accepted a contact request from {@code requesterId} on {@code propertyId}. */
    void contactAccepted(UUID requesterId, UUID ownerId, UUID propertyId, Instant at);

    /** An account was suspended. */
    void refereeSuspended(UUID userId);

    /** Moderation delisted a listing: rejected, flagged or archived by staff. */
    void listingTakenDown(UUID propertyId);

    /** Staff withdrew a listing's ownership verification. */
    void ownershipRevoked(UUID propertyId);
}
