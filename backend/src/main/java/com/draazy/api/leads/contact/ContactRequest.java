package com.draazy.api.leads.contact;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "contact_requests")
@Getter
public class ContactRequest extends AuditedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    @Column(name = "status", nullable = false)
    @Setter
    private String status = ContactRequestStatuses.PENDING;

    @Column(name = "message")
    @Setter
    private String message;

    @Column(name = "first_requested_at", nullable = false, insertable = false, updatable = false)
    private Instant firstRequestedAt;

    @Column(name = "enquired_at", nullable = false, insertable = false, updatable = false)
    private Instant enquiredAt;

    protected ContactRequest() {
    }

    public ContactRequest(UUID propertyId, UUID requesterId, String message) {
        this.propertyId = propertyId;
        this.requesterId = requesterId;
        this.message = message;
    }
}
