package com.draazy.api.common.trust;

import com.draazy.api.common.error.ConflictException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RequestSource {
    String PENDING = "pending";
    String ACCEPTED = "accepted";
    String DECLINED = "declined";
    String EXPIRED = "expired";
    String WITHDRAWN = "withdrawn";

    record Party(UUID id, String name, boolean verified) {
    }

    record Target(UUID id, String type, String title, String link) {
    }

    record RequestView(UUID id, String kind, String state, String status, Party party, Target target,
            String message, Instant slot, Instant createdAt, Instant decidedAt, Instant expiresAt,
            UUID recipientId, String share) {
        public RequestView(UUID id, String kind, String state, String status, Party party, Target target,
                String message, Instant slot, Instant createdAt, Instant decidedAt, Instant expiresAt,
                UUID recipientId) {
            this(id, kind, state, status, party, target, message, slot, createdAt, decidedAt, expiresAt,
                    recipientId, null);
        }

        public boolean pending() {
            return PENDING.equals(state);
        }
    }

    String kind();

    List<RequestView> sent(UUID requesterId, Instant since);

    List<RequestView> received(UUID recipientId, List<UUID> ownedPropertyIds, Instant since);

    Optional<RequestView> findSent(UUID requesterId, UUID id);

    void withdraw(UUID requesterId, UUID id);

    static ConflictException alreadyAnswered() {
        return new ConflictException("This request has already been answered, so it can't be withdrawn.");
    }
}
