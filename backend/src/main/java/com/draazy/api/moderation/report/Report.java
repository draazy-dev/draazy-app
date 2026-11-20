package com.draazy.api.moderation.report;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.UpdateTimestamp;

@Entity
@Table(name = "reports")
@Getter
public class Report extends BaseEntity {
    @Column(name = "target_type", nullable = false, updatable = false)
    private String targetType;

    @Column(name = "target_id", nullable = false, updatable = false)
    private String targetId;

    @Column(name = "reporter_id", updatable = false)
    private UUID reporterId;

    @Column(name = "reason", nullable = false, updatable = false)
    private String reason;

    @Column(name = "details", updatable = false)
    private String details;

    @Column(name = "status", nullable = false)
    private String status = ReportStatuses.OPEN;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Report() {
    }

    public Report(String targetType, String targetId, UUID reporterId, String reason, String details) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.reporterId = reporterId;
        this.reason = reason;
        this.details = details;
    }

    public void triage(String next) {
        if (!ReportStatuses.canTransition(this.status, next)) {
            throw new IllegalStateException(
                    "illegal report transition %s -> %s".formatted(this.status, next));
        }
        this.status = next;
    }
}
