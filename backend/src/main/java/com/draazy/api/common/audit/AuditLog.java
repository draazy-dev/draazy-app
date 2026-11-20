package com.draazy.api.common.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UuidGenerator;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "audit_log")
@Getter
public class AuditLog {
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "actor", updatable = false)
    private String actor;

    @Column(name = "actor_role", updatable = false)
    private String actorRole;

    @Column(name = "action", nullable = false, updatable = false)
    private String action;

    @Column(name = "entity", updatable = false)
    private String entity;

    @Column(name = "entity_id", updatable = false)
    private String entityId;

    @Column(name = "checker", updatable = false)
    private String checker;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", nullable = false, updatable = false)
    private String metadata = "{}";

    @CreationTimestamp
    @Column(name = "at", nullable = false, updatable = false)
    private Instant at;

    protected AuditLog() {
    }

    public AuditLog(String actor, String actorRole, String action, String entity, String entityId,
            String checker, String metadata) {
        this.actor = actor;
        this.actorRole = actorRole;
        this.action = action;
        this.entity = entity;
        this.entityId = entityId;
        this.checker = checker;
        this.metadata = metadata == null ? "{}" : metadata;
    }
}
