package com.draazy.api.identity.auth;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Component;

// Gives addresses that are not back-office accounts the same lock as StaffCredential, so a 429
// cannot confirm that an email belongs to staff. Keep the two lock rules identical.
@Component
class StaffSignInDecoyLocks {
    private static final int MAX_TRACKED = 50_000;

    private final Map<String, Decoy> decoys = new LinkedHashMap<>(256, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Decoy> eldest) {
            return size() > MAX_TRACKED;
        }
    };

    synchronized Instant lockedUntil(String email, Instant now) {
        Decoy decoy = decoys.get(key(email));
        return decoy != null && decoy.lockedUntil != null && now.isBefore(decoy.lockedUntil)
                ? decoy.lockedUntil : null;
    }

    synchronized void recordFailure(String email, Instant now) {
        Decoy decoy = decoys.computeIfAbsent(key(email), ignored -> new Decoy());
        decoy.failedAttempts++;
        if (decoy.failedAttempts >= StaffCredential.MAX_FAILED_ATTEMPTS) {
            decoy.failedAttempts = 0;
            decoy.lockedUntil = now.plus(StaffCredential.LOCKOUT);
        }
    }

    private static String key(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static final class Decoy {
        private int failedAttempts;
        private Instant lockedUntil;
    }
}
