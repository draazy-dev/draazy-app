package com.draazy.api.common.trust;

import java.util.Optional;
import java.util.UUID;

public interface FlatmateRequestParties {
    Optional<Pair> chattable(UUID requestId, UUID userId);

    record Pair(UUID counterparty, String targetKind, UUID targetId) {
    }
}
