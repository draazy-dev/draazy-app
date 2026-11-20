package com.draazy.api.finance.tenancy;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "tenancy_declarations")
@Getter
public class TenancyDeclaration extends AuditedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "declarant_id", nullable = false, updatable = false)
    private UUID declarantId;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "status", nullable = false)
    private String status = TenancyDeclarationStatuses.PENDING;

    @Column(name = "lived_from")
    private LocalDate livedFrom;

    @Column(name = "lived_to")
    private LocalDate livedTo;

    @Column(name = "decided_at")
    private Instant decidedAt;

    protected TenancyDeclaration() {
    }

    TenancyDeclaration(UUID propertyId, UUID declarantId, UUID ownerId, LocalDate livedFrom,
            LocalDate livedTo) {
        this.propertyId = propertyId;
        this.declarantId = declarantId;
        this.ownerId = ownerId;
        this.livedFrom = livedFrom;
        this.livedTo = livedTo;
    }

    void decide(String status) {
        this.status = status;
        this.decidedAt = Instant.now();
    }
}
