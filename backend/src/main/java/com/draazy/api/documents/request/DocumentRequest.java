package com.draazy.api.documents.request;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "document_requests")
@Getter
public class DocumentRequest extends AuditedEntity {
    @Column(name = "property_id", nullable = false, updatable = false)
    private UUID propertyId;

    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "categories", nullable = false)
    private List<String> categories = new ArrayList<>();

    @Column(name = "status", nullable = false)
    private String status = DocumentRequestStatuses.PENDING;

    @Column(name = "share_token")
    private String shareToken;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @Column(name = "acknowledged_disclaimer", nullable = false)
    @Setter
    private boolean acknowledgedDisclaimer;

    @Column(name = "message")
    @Setter
    private String message;

    protected DocumentRequest() {
    }

    public DocumentRequest(UUID propertyId, UUID requesterId, List<String> categories,
            String message, boolean acknowledgedDisclaimer) {
        this.propertyId = propertyId;
        this.requesterId = requesterId;
        this.categories = categories == null ? new ArrayList<>() : new ArrayList<>(categories);
        this.message = message;
        this.acknowledgedDisclaimer = acknowledgedDisclaimer;
    }

    public void grant(String shareToken, Instant expiresAt) {
        this.status = DocumentRequestStatuses.GRANTED;
        this.shareToken = shareToken;
        this.expiresAt = expiresAt;
    }

    public void decline() {
        this.status = DocumentRequestStatuses.DECLINED;
        this.shareToken = null;
        this.expiresAt = null;
    }

    public void setCategories(List<String> categories) {
        this.categories = categories == null ? new ArrayList<>() : new ArrayList<>(categories);
    }
}
