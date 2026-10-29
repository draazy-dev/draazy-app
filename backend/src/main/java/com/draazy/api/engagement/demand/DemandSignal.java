package com.draazy.api.engagement.demand;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "demand_signals")
@Getter
public class DemandSignal extends BaseEntity {
    @Column(name = "kind", nullable = false, updatable = false)
    @Setter
    private String kind;

    @Column(name = "locality_slug", updatable = false)
    @Setter
    private String localitySlug;

    @Column(name = "deal", updatable = false)
    @Setter
    private String deal;

    @Column(name = "bhk", updatable = false)
    @Setter
    private String bhk;

    @Column(name = "property_id", updatable = false)
    @Setter
    private UUID propertyId;

    @Column(name = "user_id", updatable = false)
    @Setter
    private UUID userId;
}
