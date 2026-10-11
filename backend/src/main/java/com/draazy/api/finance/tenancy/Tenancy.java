package com.draazy.api.finance.tenancy;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

/** A rental of one property. Created only by closing a rent deal, and starts {@code pending}. */
@Entity
@Table(name = "tenancies")
@Getter
public class Tenancy extends AuditedEntity {

    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "tenant_id", nullable = false, updatable = false)
    private UUID tenantId;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    /** Monthly rent, whole INR — the agreed price from the closed deal. */
    @Column(name = "rent")
    @Setter
    private Long rent;

    /** Security deposit, whole INR. */
    @Column(name = "deposit")
    @Setter
    private Long deposit;

    @Column(name = "start_date")
    @Setter
    private LocalDate startDate;

    @Column(name = "end_date")
    @Setter
    private LocalDate endDate;

    /** The number the owner named at close; the confirming account's verified mobile must match it. */
    @Column(name = "tenant_mobile", updatable = false)
    private String tenantMobile;

    /** One of {@link TenancyStatuses}; the V109 CHECK rejects anything else. */
    @Column(name = "status", nullable = false)
    @Setter
    private String status = TenancyStatuses.ACTIVE;

    protected Tenancy() {
        // JPA
    }

    public Tenancy(UUID propertyId, UUID tenantId, UUID ownerId) {
        this.propertyId = propertyId;
        this.tenantId = tenantId;
        this.ownerId = ownerId;
    }

    public Tenancy(UUID propertyId, UUID tenantId, UUID ownerId, String tenantMobile) {
        this(propertyId, tenantId, ownerId);
        this.tenantMobile = tenantMobile;
    }

}
