package com.draazy.api.catalog.fee;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

// Seeded by R__DML_seed_reference_data.sql; settings('fees') overrides the rent row's platformFee.
// Null stampDuty/registration means computed per agreement, so never coerce it to zero.
@Entity
@Table(name = "platform_fees")
@Getter
public class PlatformFee {

    public static final String RENT = "rent";

    @Id
    @Column(name = "deal", nullable = false, updatable = false)
    private String deal;

    @Column(name = "brokerage", nullable = false)
    private long brokerage;

    @Column(name = "platform_fee", nullable = false)
    private long platformFee;

    @Column(name = "stamp_duty")
    private Long stampDuty;

    @Column(name = "registration")
    private Long registration;

    @Column(name = "notes")
    private String notes;

    protected PlatformFee() {
        // JPA
    }

}
