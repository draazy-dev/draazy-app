package com.draazy.api.identity.verification;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "identity_appeals")
@Getter
public class IdentityAppeal extends AuditedEntity {

    public static final String OPEN = "open";
    public static final String UPHELD = "upheld";
    public static final String REOPENED = "reopened";
    public static final String SUPERSEDED = "superseded";

    @Column(name = "verification_id", nullable = false, updatable = false)
    private UUID verificationId;

    @Column(name = "ticket_id")
    @Setter
    private UUID ticketId;

    @Column(name = "status", nullable = false)
    @Setter
    private String status = OPEN;

    @Column(name = "note", nullable = false, updatable = false)
    private String note;

    @Column(name = "decided_by")
    @Setter
    private UUID decidedBy;

    @Column(name = "decided_at")
    @Setter
    private Instant decidedAt;

    protected IdentityAppeal() {

    }

    public IdentityAppeal(UUID verificationId, String note) {
        this.verificationId = verificationId;
        this.note = note;
    }
}
