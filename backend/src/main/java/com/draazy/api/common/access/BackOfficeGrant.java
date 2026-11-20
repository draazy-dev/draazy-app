package com.draazy.api.common.access;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "back_office_permissions")
@Getter
public class BackOfficeGrant {
    @Id
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "permissions", nullable = false)
    private String permissions = "[]";

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "updated_by")
    private UUID updatedBy;

    protected BackOfficeGrant() {
    }

    public BackOfficeGrant(UUID userId, String permissions, UUID updatedBy) {
        this.userId = userId;
        this.permissions = permissions;
        this.updatedBy = updatedBy;
    }

    public void replace(String permissions, UUID updatedBy) {
        this.permissions = permissions;
        this.updatedBy = updatedBy;
    }
}
