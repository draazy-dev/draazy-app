package com.draazy.api.common.persistence;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import java.time.Instant;
import org.hibernate.annotations.UpdateTimestamp;

@MappedSuperclass
public abstract class AuditedEntity extends BaseEntity {
    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
