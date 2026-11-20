package com.draazy.api.finance.tenancy;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "tenant_profiles")
@Getter
public class TenantProfile {
    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "name")
    @Setter
    private String name;

    @Column(name = "occupation")
    @Setter
    private String occupation;

    @Column(name = "income")
    @Setter
    private Long income;

    @Column(name = "occupants")
    @Setter
    private String occupants;

    @Column(name = "move_in")
    @Setter
    private LocalDate moveIn;

    @Column(name = "prior_landlord")
    @Setter
    private String priorLandlord;

    @Column(name = "about")
    @Setter
    private String about;

    @Column(name = "score")
    @Setter
    private Integer score;

    @Column(name = "verified", nullable = false)
    @Setter
    private boolean verified;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected TenantProfile() {
    }

    public TenantProfile(UUID userId) {
        this.userId = userId;
    }
}
