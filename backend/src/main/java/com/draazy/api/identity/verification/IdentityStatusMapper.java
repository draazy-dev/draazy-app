package com.draazy.api.identity.verification;

import java.time.Instant;
import org.springframework.stereotype.Component;

@Component
class IdentityStatusMapper {

    private final IdentityAppeals appeals;

    IdentityStatusMapper(IdentityAppeals appeals) {
        this.appeals = appeals;
    }

    IdentityVerificationResponse none() {
        return new IdentityVerificationResponse(VerificationStatuses.NONE, null, null, null,
                null, null, null, null, null, IdentityVerificationService.MAX_ATTEMPTS_PER_WINDOW, null, null, false);
    }

    IdentityVerificationResponse toStatus(IdentityVerification v, Instant now) {
        if (VerificationStatuses.WITHDRAWN.equals(v.getStatus())) {
            return none();
        }
        Instant windowEnd = v.getAttemptWindowStart().plus(IdentityVerificationService.ATTEMPT_WINDOW);
        int used = now.isBefore(windowEnd) ? v.getAttemptCount() : 0;
        int remaining = Math.max(0, IdentityVerificationService.MAX_ATTEMPTS_PER_WINDOW - used);
        boolean open = VerificationStatuses.REJECTED.equals(v.getStatus())
                || VerificationStatuses.REVOKED.equals(v.getStatus());
        return new IdentityVerificationResponse(
                v.getStatus(),
                v.getDocType(),
                v.getDocLast4(),
                v.getSubmittedAt(),
                v.getDecidedAt(),
                v.getRejectionReason(),
                v.getRejectionNote(),
                v.getRevokedAt(),
                v.getRevocationReason(),
                open ? remaining : 0,
                open && remaining == 0 ? windowEnd : null,
                appeals.current(v).orElse(null),
                appeals.canAppeal(v));
    }
}
