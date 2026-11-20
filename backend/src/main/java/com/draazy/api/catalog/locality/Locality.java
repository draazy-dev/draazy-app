package com.draazy.api.catalog.locality;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;

@Entity
@Table(name = "localities")
@Getter
public class Locality {
    @Id
    @Column(name = "slug", nullable = false, updatable = false)
    private String slug;

    @Column(name = "name", nullable = false)
    private String name;

    @Column(name = "city", nullable = false)
    private String city;

    @Column(name = "avg_rent_psf")
    private BigDecimal avgRentPsf;

    @Column(name = "avg_buy_psf")
    private BigDecimal avgBuyPsf;

    @Column(name = "rate_per_sqft")
    private BigDecimal ratePerSqft;

    @Column(name = "avg_rent")
    private Long avgRent;

    @Column(name = "demand")
    private Integer demand;

    @Column(name = "focus")
    private String focus;

    @Column(name = "lat")
    private Double lat;

    @Column(name = "lng")
    private Double lng;

    @Column(name = "active", nullable = false)
    private boolean active = true;

    @Column(name = "place_id")
    private String placeId;

    @Column(name = "archived_at")
    private Instant archivedAt;

    protected Locality() {
    }

    public boolean isArchived() {
        return archivedAt != null;
    }

    public void retire(Instant at) {
        archivedAt = at;
        active = true;
    }

    public void restore() {
        archivedAt = null;
        active = true;
    }
}
