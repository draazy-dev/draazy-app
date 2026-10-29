package com.draazy.api.documents.agreement;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "rent_agreements")
@Getter
public class RentAgreement extends AuditedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "tenant_mobile")
    private String tenantMobile;

    @Column(name = "rent")
    private Long rent;

    @Column(name = "deposit")
    private Long deposit;

    @Column(name = "start_date")
    private LocalDate startDate;

    @Column(name = "duration_months")
    private Integer durationMonths;

    @Column(name = "status", nullable = false)
    private String status = RentAgreementStatuses.DRAFT;

    @Column(name = "document_url")
    private String documentUrl;

    @Column(name = "service_request_id", updatable = false)
    private UUID serviceRequestId;

    @Column(name = "final_document_id", updatable = false)
    private UUID finalDocumentId;

    @Column(name = "prepared_by", updatable = false)
    private UUID preparedBy;

    @Column(name = "verified_by")
    private UUID verifiedBy;

    @Column(name = "renewal_reminded_at")
    private Instant renewalRemindedAt;

    protected RentAgreement() {
    }

    RentAgreement(PreparedAgreement prepared, String tenantMobile) {
        this.propertyId = prepared.propertyId();
        this.ownerId = prepared.ownerId();
        this.tenantMobile = tenantMobile;
        this.rent = prepared.rent();
        this.deposit = prepared.deposit();
        this.startDate = prepared.startDate();
        this.durationMonths = prepared.durationMonths();
        this.serviceRequestId = prepared.serviceRequestId();
        this.finalDocumentId = prepared.finalDocumentId();
        this.preparedBy = prepared.preparedBy();
    }

    void markRenewalReminded(Instant at) {
        this.renewalRemindedAt = at;
    }

    public LocalDate endDate() {
        return startDate == null || durationMonths == null
                ? null : startDate.plusMonths(durationMonths).minusDays(1);
    }

    void moveTo(String next, UUID actor) {
        this.status = next;
        if (RentAgreementStatuses.REGISTERED.equals(next)) {
            this.verifiedBy = actor;
        }
    }
}
