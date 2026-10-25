package com.draazy.api.common.trust;

import com.draazy.api.common.error.ConflictException;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** One kind of request the requests inbox lists, as a port so engagement can merge kinds owned by other contexts. */
public interface RequestSource {

    String PENDING = "pending";
    String ACCEPTED = "accepted";
    String DECLINED = "declined";
    String EXPIRED = "expired";
    String WITHDRAWN = "withdrawn";

    /** The other side of the request: the requester in a received box, the recipient in a sent one. */
    record Party(UUID id, String name, boolean verified) {
    }

    record Target(UUID id, String type, String title, String link) {
    }

    record RequestView(UUID id, String kind, String state, String status, Party party, Target target,
            String message, Instant slot, Instant createdAt, Instant decidedAt, Instant expiresAt,
            UUID recipientId, String share) {

        /** Every kind but a flatmate interest has no share intent. */
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

    /** Everything the requester still has open, plus what was decided or created since {@code since}. */
    List<RequestView> sent(UUID requesterId, Instant since);

    /** Everything still open for the recipient, plus what was decided since {@code since}. */
    List<RequestView> received(UUID recipientId, Instant since);

    Optional<RequestView> findSent(UUID requesterId, UUID id);

    /** Withdraws a pending request the caller sent; throws {@link #alreadyAnswered()} if it was decided first. */
    void withdraw(UUID requesterId, UUID id);

    static ConflictException alreadyAnswered() {
        return new ConflictException("This request has already been answered, so it can't be withdrawn.");
    }
}
