package com.draazy.api.identity.user.erasure;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "erasure_requests")
@Getter
public class ErasureRequest extends BaseEntity {
    @Column(name = "subject_id")
    private UUID subjectId;

    @Column(name = "subject_digest", nullable = false, updatable = false)
    private String subjectDigest;

    @Column(name = "status", nullable = false)
    private String status = ErasureStatuses.PENDING;

    @Column(name = "reason", updatable = false)
    private String reason;

    @Column(name = "requested_at", nullable = false, updatable = false)
    private Instant requestedAt = Instant.now();

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_note")
    private String decisionNote;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "erased", nullable = false)
    private String erased = "{}";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "retained", nullable = false)
    private String retained = "{}";

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ErasureRequest() {
    }

    public ErasureRequest(UUID subjectId, String subjectDigest, String reason) {
        this.subjectId = subjectId;
        this.subjectDigest = subjectDigest;
        this.reason = reason;
    }

    public void complete(UUID admin, String note, String erasedJson, String retainedJson) {
        this.status = ErasureStatuses.COMPLETED;
        this.subjectId = null;
        this.decidedBy = admin;
        this.decidedAt = Instant.now();
        this.decisionNote = note;
        this.erased = erasedJson;
        this.retained = retainedJson;
    }

    public void reject(UUID admin, String note) {
        this.status = ErasureStatuses.REJECTED;
        this.decidedBy = admin;
        this.decidedAt = Instant.now();
        this.decisionNote = note;
    }
}
