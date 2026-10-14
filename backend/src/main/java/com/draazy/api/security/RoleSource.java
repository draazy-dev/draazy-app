package com.draazy.api.security;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

// The current role, re-read per request so a demotion lands on the next call, not at token expiry.
// An interface here because the shared kernel may not import identity (package-structure.md section 2).
public interface RoleSource {

    // Empty is not a denial: with no stored row the claimed role stands, as PermissionMap treats a missing document.
    Optional<Standing> standingOf(UUID userId);

    interface Standing {

        String getRole();

        /** Logout, suspension, archive and refresh-token theft all set this; older tokens die. */
        Instant getSessionsRevokedAt();

        // Suspended, erased or archived: refused on every request, whatever the token's timing.
        boolean isBlocked();
    }
}
