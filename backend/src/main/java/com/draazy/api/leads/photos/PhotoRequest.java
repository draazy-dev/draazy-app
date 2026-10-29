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

    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    @Column(name = "status", nullable = false)
    private String status = PhotoRequestStatuses.PENDING;

    @Column(name = "decided_at")
    private Instant decidedAt;

    protected PhotoRequest() {
    }

    public PhotoRequest(UUID propertyId, UUID requesterId) {
        this.propertyId = propertyId;
        this.requesterId = requesterId;
    }

    public void reopen() {
        this.status = PhotoRequestStatuses.PENDING;
        this.decidedAt = null;
    }

    public void decide(String decision, Instant at) {
        if (!PhotoRequestStatuses.PENDING.equals(this.status)) {
            return;
        }
        this.status = decision;
        this.decidedAt = at;
    }
}
