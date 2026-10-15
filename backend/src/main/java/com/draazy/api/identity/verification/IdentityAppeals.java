package com.draazy.api.identity.verification;

import java.util.Collection;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class IdentityAppeals {

    private final IdentityAppealRepository appeals;

    public IdentityAppeals(IdentityAppealRepository appeals) {
        this.appeals = appeals;
    }

    /** The appeal that still describes this case: open, or its outcome while the case sits in that state. */
    public Optional<IdentityAppealInfo> current(IdentityVerification v) {
        return appeals.findFirstByVerificationIdOrderByCreatedAtDesc(v.getId())
                .filter(a -> switch (a.getStatus()) {
                    case IdentityAppeal.OPEN -> true;
                    case IdentityAppeal.UPHELD -> VerificationStatuses.REJECTED.equals(v.getStatus());
                    case IdentityAppeal.REOPENED -> VerificationStatuses.PENDING.equals(v.getStatus());
                    default -> false;
                })
                .map(IdentityAppealInfo::of);
    }

    public Set<UUID> openAmong(Collection<UUID> verificationIds) {
        return verificationIds.isEmpty() ? Set.of() : Set.copyOf(appeals.openVerificationIds(verificationIds));
    }

    /** Photos already purged cannot be re-reviewed, so those rejections go back to "try again". */
    public boolean canAppeal(IdentityVerification v) {
        if (!VerificationStatuses.REJECTED.equals(v.getStatus()) || v.getFilesPurgedAt() != null) {
            return false;
        }
        return appeals.findFirstByVerificationIdOrderByCreatedAtDesc(v.getId())
                .map(a -> IdentityAppeal.SUPERSEDED.equals(a.getStatus())
                        || IdentityAppeal.REOPENED.equals(a.getStatus()))
                .orElse(true);
    }
}
