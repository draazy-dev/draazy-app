package com.draazy.api.common.trust;

import java.util.Optional;
import java.util.UUID;

/** A visit or offer the owner said yes to introduces the pair; a port so {@code leads} skips {@code deals}. */
public interface LeadIntroductions {

    /** The requests-inbox kind this answers for: {@code visit} or {@code offer}. */
    String kind();

    /** The other side and the listing once the owner said yes; empty for anyone else or an undecided request. */
    Optional<Pair> chattable(UUID requestId, UUID userId);

    /** Sticky once the owner said yes: a later reschedule or cancel does not un-introduce the pair. */
    boolean introduces(UUID requesterId, UUID propertyId);

    record Pair(UUID counterparty, UUID propertyId) {
    }

    static Optional<Pair> between(UUID userId, UUID requesterId, UUID ownerId, UUID propertyId) {
        if (ownerId == null || requesterId.equals(ownerId)) {
            return Optional.empty();
        }
        UUID other = userId.equals(requesterId) ? ownerId : userId.equals(ownerId) ? requesterId : null;
        return Optional.ofNullable(other).map(counterparty -> new Pair(counterparty, propertyId));
    }
}
