package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.trust.WithdrawnCooldown;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Withdrawn interests are hard-deleted, but each already reached a host, so the ledger keeps them counting. */
@Component
class FlatmateInterestLedger {

    private final FlatmateRequestRepository requests;
    private final FlatmateInterestWithdrawalRepository withdrawals;

    FlatmateInterestLedger(FlatmateRequestRepository requests, FlatmateInterestWithdrawalRepository withdrawals) {
        this.requests = requests;
        this.withdrawals = withdrawals;
    }

    long sentSince(UUID requesterId, Instant since) {
        return requests.countByRequesterIdAndCreatedAtAfter(requesterId, since)
                + withdrawals.countByRequesterIdAndRequestedAtAfter(requesterId, since);
    }

    void requireNotRecentlyWithdrawn(String kind, UUID targetId, UUID requesterId) {
        withdrawals.findFirstByRequesterIdAndKindAndTargetIdOrderByWithdrawnAtDesc(requesterId, kind, targetId)
                .map(FlatmateInterestWithdrawal::getWithdrawnAt)
                .filter(at -> WithdrawnCooldown.active(at, Instant.now()))
                .ifPresent(at -> {
                    throw WithdrawnCooldown.refusal(at);
                });
    }

    void recordWithdrawal(FlatmateRequest request) {
        withdrawals.save(new FlatmateInterestWithdrawal(request, Instant.now()));
    }
}
