package com.draazy.api.security;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface RoleSource {
    Optional<Standing> standingOf(UUID userId);

    interface Standing {
        String getRole();

        Instant getSessionsRevokedAt();

        boolean isBlocked();
    }
}
