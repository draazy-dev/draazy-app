package com.draazy.api.common.trust;

import java.util.Optional;
import java.util.UUID;

public interface FlatmateRequestParties {

    /** Accepted requests, plus a pending group join the host opens to vet the requester first. */
    Optional<Pair> chattable(UUID requestId, UUID userId);

    /** {@code targetKind} is the wire kind: {@code room}, {@code group} or {@code post}. */
    record Pair(UUID counterparty, String targetKind, UUID targetId) {
    }
}
