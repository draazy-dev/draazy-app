package com.draazy.api.documents.vault;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;

@Entity
@Table(name = "documents")
@Getter
public class Document extends AuditedEntity {
    @Column(name = "property_id", updatable = false)
    private UUID propertyId;

    @Column(name = "category")
    private String category;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "storage_key", updatable = false)
    private String storageKey;

    @Column(name = "size_bytes")
    private Long sizeBytes;

    @Column(name = "mime_type")
    private String mimeType;

    @Column(name = "service_request_id")
    private UUID serviceRequestId;

    @CreationTimestamp
    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt;

    protected Document() {
    }

    public Document(UUID propertyId, String category, String fileName, String storageKey,
            long sizeBytes, String mimeType) {
        this.propertyId = propertyId;
        this.category = category;
        this.fileName = fileName;
        this.storageKey = storageKey;
        this.sizeBytes = sizeBytes;
        this.mimeType = mimeType;
    }

    public Document(UUID propertyId, UUID serviceRequestId, String category, String fileName,
            String storageKey, long sizeBytes, String mimeType) {
        this(propertyId, category, fileName, storageKey, sizeBytes, mimeType);
        this.serviceRequestId = serviceRequestId;
    }
}
