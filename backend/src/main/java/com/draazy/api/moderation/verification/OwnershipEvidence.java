package com.draazy.api.moderation.verification;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "property_ownership_evidence")
@Getter
public class OwnershipEvidence extends AuditedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "doc_type", nullable = false, updatable = false)
    private String docType;

    @Column(name = "document_id")
    private UUID documentId;

    @Column(name = "issued_at", nullable = false, updatable = false)
    private Instant issuedAt;

    @Column(name = "expires_at", updatable = false)
    private Instant expiresAt;

    @Column(name = "recorded_by", nullable = false, updatable = false)
    private UUID recordedBy;

    @Column(name = "subject_name", updatable = false)
    private String subjectName;

    protected OwnershipEvidence() {
    }

    public OwnershipEvidence(UUID propertyId, String docType, UUID documentId, LocalDate issuedOn,
            UUID recordedBy, String subjectName) {
        this.propertyId = propertyId;
        this.docType = docType;
        this.documentId = documentId;
        this.issuedAt = issuedOn.atStartOfDay(PlatformTime.IST).toInstant();
        this.expiresAt = OwnershipEvidenceTypes.expiryOf(docType, this.issuedAt);
        this.recordedBy = recordedBy;
        this.subjectName = subjectName;
    }

    public String kind() {
        return OwnershipEvidenceTypes.kindOf(docType);
    }

    public boolean isCurrentAt(Instant now) {
        return expiresAt == null || expiresAt.isAfter(now);
    }
}
