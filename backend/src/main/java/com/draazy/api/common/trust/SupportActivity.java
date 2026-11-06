package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.UUID;

/** A message landed where a user talks to staff (ticket, review, service request, flatmate case). */
public record SupportActivity(
        UUID userId,
        Side side,
        UUID staffId,
        String aboutType,
        String aboutId,
        String preview,
        Instant at) {
    public enum Side { USER, STAFF }
}
