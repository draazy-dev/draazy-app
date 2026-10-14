package com.draazy.api.leads.contact;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

/** Contact gate row ({@code contact_requests}); ids rather than associations to keep the leads context decoupled. */
@Entity
@Table(name = "contact_requests")
@Getter
public class ContactRequest extends AuditedEntity {

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    /** The asking user. Always taken from the JWT — never from the request body. */
    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    /** One of {@link ContactRequestStatuses}; the V4 CHECK rejects anything else. */
    @Column(name = "status", nullable = false)
    @Setter
    private String status = ContactRequestStatuses.PENDING;

    /** Optional free-text note from the requester, shown to the owner in their inbox. */
    @Column(name = "message")
    @Setter
    private String message;

    /** When the asker first spent this contact; written once by the database, never moved by a renewal. */
    @Column(name = "first_requested_at", nullable = false, insertable = false, updatable = false)
    private Instant firstRequestedAt;

    /** When the asker first enquired on the listing; written once by the database and never moved. */
    @Column(name = "enquired_at", nullable = false, insertable = false, updatable = false)
    private Instant enquiredAt;

    protected ContactRequest() {
        // JPA
    }

    public ContactRequest(UUID propertyId, UUID requesterId, String message) {
        this.propertyId = propertyId;
        this.requesterId = requesterId;
        this.message = message;
    }

}
