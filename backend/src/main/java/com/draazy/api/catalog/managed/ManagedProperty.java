package com.draazy.api.catalog.managed;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.DynamicUpdate;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

// ManagedAgreementHomes writes the lease columns over JDBC; a full-row update would clobber them.
@Entity
@Table(name = "managed_properties")
@DynamicUpdate
@Getter
public class ManagedProperty extends AuditedEntity {
    public static final String VISIBILITY_PRIVATE = "private";
    public static final String VISIBILITY_PUBLIC = "public";
    public static final String STATUS_MANAGED = "managed";
    public static final String STATUS_PUBLISHED = "published";
    public static final long MAX_MONTHLY_RENT = 10_000_000L;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private UUID ownerId;

    @Column(name = "title", nullable = false)
    @Setter
    private String title;

    @Column(name = "deal", nullable = false)
    @Setter
    private String deal;

    @Column(name = "property_type", nullable = false)
    @Setter
    private String propertyType;

    @Column(name = "bhk")
    @Setter
    private BigDecimal bhk;

    @Column(name = "price", nullable = false)
    @Setter
    private Long price;

    @Column(name = "locality", nullable = false)
    @Setter
    private String locality;

    @Column(name = "locality_slug")
    @Setter
    private String localitySlug;

    @Column(name = "society")
    @Setter
    private String society;

    @Column(name = "area")
    @Setter
    private BigDecimal area;

    @Column(name = "area_unit", nullable = false)
    @Setter
    private String areaUnit = "sqft";

    @Column(name = "furnishing")
    @Setter
    private String furnishing;

    @Column(name = "visibility", nullable = false)
    private String visibility = VISIBILITY_PRIVATE;

    @Column(name = "status", nullable = false)
    private String status = STATUS_MANAGED;

    @Column(name = "rented", nullable = false)
    @Setter
    private boolean rented = false;

    @Column(name = "tenant_name")
    @Setter
    private String tenantName;

    @Column(name = "tenant_mobile")
    private String tenantMobile;

    @Column(name = "tenant_since")
    private Instant tenantSince;

    @Column(name = "monthly_rent")
    @Setter
    private Long monthlyRent;

    @Column(name = "due_day")
    @Setter
    private Integer dueDay;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "valuation")
    @Setter
    private Map<String, Object> valuation;

    @Column(name = "published_listing_id")
    private UUID publishedListingId;

    @Column(name = "source_room_id", updatable = false)
    private UUID sourceRoomId;

    @Column(name = "address_fingerprint", updatable = false)
    private String addressFingerprint;

    // Written only by ManagedAgreementHomes, over JDBC.
    @Column(name = "lease_end", insertable = false)
    private LocalDate leaseEnd;

    @Column(name = "deposit", insertable = false)
    private Long deposit;

    @Column(name = "agreement_request_id", insertable = false)
    private UUID agreementRequestId;

    @Column(name = "landlord_pan")
    @Setter
    private String landlordPan;

    protected ManagedProperty() {
    }

    public ManagedProperty(UUID ownerId, String title, String deal, String propertyType,
            BigDecimal bhk, Long price, String locality, String localitySlug, String society,
            BigDecimal area, String areaUnit, String furnishing) {
        this.ownerId = ownerId;
        this.title = title;
        this.deal = deal;
        this.propertyType = propertyType;
        this.bhk = bhk;
        this.price = price;
        this.locality = locality;
        this.localitySlug = localitySlug;
        this.society = society;
        this.area = area;
        this.areaUnit = areaUnit == null ? "sqft" : areaUnit;
        this.furnishing = furnishing;
    }

    public boolean setTenantMobile(String mobile) {
        if (Objects.equals(mobile, tenantMobile)) {
            return false;
        }
        this.tenantMobile = mobile;
        this.tenantSince = mobile == null ? null : Instant.now();
        // A tenant named by hand is not on the registered agreement these came from.
        this.leaseEnd = null;
        this.deposit = null;
        this.agreementRequestId = null;
        return mobile != null;
    }

    public void markPublished(UUID listingId) {
        this.publishedListingId = listingId;
        this.visibility = VISIBILITY_PUBLIC;
        this.status = STATUS_PUBLISHED;
    }
}
