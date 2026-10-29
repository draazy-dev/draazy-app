package com.draazy.api.common.trust;

import java.util.Optional;
import java.util.UUID;

public interface LeadIntroductions {
    String kind();

    Optional<Pair> chattable(UUID requestId, UUID userId);

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
