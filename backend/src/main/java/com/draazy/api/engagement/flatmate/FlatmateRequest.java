package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

/** One person asking one host for one seat. No FK on {@code (kind, targetId)}: every target is soft-deleted;
 *  {@code hostId} is denormalised so the inbox never resolves targets. */
@Entity
@Table(name = "flatmate_requests")
@Getter
public class FlatmateRequest extends AuditedEntity {

    /** Which collection {@link #targetId} points into: {@code flatmate}, {@code room} or {@code group}. */
    @Column(name = "kind", nullable = false, updatable = false)
    private String kind;

    @Column(name = "target_id", nullable = false, updatable = false)
    private UUID targetId;

    @Column(name = "host_id", nullable = false, updatable = false)
    private UUID hostId;

    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    /** Always {@code request} now; {@code join} survives only on rows from the retired auto-join. */
    @Column(name = "action", nullable = false)
    private String action = "request";

    @Column(name = "share", nullable = false)
    private String share = "solo";

    @Column(name = "message")
    private String message;

    @Column(name = "status", nullable = false)
    private String status = FlatmateVocabulary.STATUS_PENDING;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt = Instant.now();

    @Column(name = "decided_at")
    private Instant decidedAt;

    protected FlatmateRequest() {
    }

    FlatmateRequest(String kind, UUID targetId, UUID hostId, UUID requesterId,
            String share, String message) {
        this.kind = kind;
        this.targetId = targetId;
        this.hostId = hostId;
        this.requesterId = requesterId;
        this.share = share;
        this.message = message;
    }

    /** The host's decision. The check constraint guarantees the timestamp travels with it. */
    void decide(String decision) {
        this.status = decision;
        this.decidedAt = Instant.now();
    }

    public boolean isPending() {
        return FlatmateVocabulary.STATUS_PENDING.equals(status);
    }
}
