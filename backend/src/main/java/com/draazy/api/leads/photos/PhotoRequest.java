package com.draazy.api.leads.photos;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "photo_requests")
@Getter
public class PhotoRequest extends AuditedEntity {

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    /** The asking user. Always taken from the JWT — never from the request body. */
    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    /** One of {@link PhotoRequestStatuses}; the V118 CHECK rejects anything else. */
    @Column(name = "status", nullable = false)
    private String status = PhotoRequestStatuses.PENDING;

    @Column(name = "decided_at")
    private Instant decidedAt;

    protected PhotoRequest() {
        // JPA
    }

    public PhotoRequest(UUID propertyId, UUID requesterId) {
        this.propertyId = propertyId;
        this.requesterId = requesterId;
    }

    public void reopen() {
        this.status = PhotoRequestStatuses.PENDING;
        this.decidedAt = null;
    }

    // Terminal answers never convert, so a repeat call cannot move decidedAt nor turn a decline into a resolution.
    public void decide(String decision, Instant at) {
        if (!PhotoRequestStatuses.PENDING.equals(this.status)) {
            return;
        }
        this.status = decision;
        this.decidedAt = at;
    }
}
