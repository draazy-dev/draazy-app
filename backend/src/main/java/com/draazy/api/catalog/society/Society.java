package com.draazy.api.catalog.society;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "societies")
@Getter
public class Society extends AuditedEntity {
    @Column(name = "slug", nullable = false, updatable = false)
    private String slug;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "builder")
    private String builder;

    @Column(name = "locality_slug")
    private String localitySlug;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    @Column(name = "place_id")
    private String placeId;

    @Column(name = "year")
    private Integer year;

    @Column(name = "towers")
    private Integer towers;

    @Column(name = "units")
    private Integer units;

    @Column(name = "occupancy")
    private BigDecimal occupancy;

    @Column(name = "maintenance_per_sqft")
    private BigDecimal maintenancePerSqft;

    @Column(name = "parking_ratio")
    private BigDecimal parkingRatio;

    @Column(name = "lifts")
    private Integer lifts;

    @Column(name = "security")
    private String security;

    @Column(name = "water")
    private String water;

    @Column(name = "power")
    private String power;

    @Column(name = "pet_policy")
    private String petPolicy;

    @Column(name = "veg_policy")
    private String vegPolicy;

    @Column(name = "rera")
    private String rera;

    @Column(name = "registration", nullable = false)
    private boolean registration;

    @Column(name = "conveyance", nullable = false)
    private boolean conveyance;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "amenities", nullable = false)
    private List<String> amenities = new ArrayList<>();

    @Column(name = "source")
    private String source;

    @Column(name = "mint_origin")
    private String mintOrigin;

    @Column(name = "created_by")
    private java.util.UUID createdBy;

    @Column(name = "merged_into")
    private java.util.UUID mergedInto;

    @Column(name = "merged_at")
    private java.time.Instant mergedAt;

    @Column(name = "merged_by")
    private java.util.UUID mergedBy;

    @Column(name = "archived_at")
    private java.time.Instant archivedAt;

    // Moderator prose: must never reach SocietyResponse, which anonymous reads serve.
    @Column(name = "admin_note")
    private String adminNote;

    protected Society() {
    }
}
