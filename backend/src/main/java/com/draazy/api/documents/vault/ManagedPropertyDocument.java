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
@Table(name = "managed_property_documents")
@Getter
public class ManagedPropertyDocument extends AuditedEntity {
    @Column(name = "managed_property_id", nullable = false, updatable = false)
    private UUID managedPropertyId;

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

    @CreationTimestamp
    @Column(name = "uploaded_at", nullable = false, updatable = false)
    private Instant uploadedAt;

    protected ManagedPropertyDocument() {
    }

    public ManagedPropertyDocument(UUID managedPropertyId, String category, String fileName,
            String storageKey, long sizeBytes, String mimeType) {
        this.managedPropertyId = managedPropertyId;
        this.category = category;
        this.fileName = fileName;
        this.storageKey = storageKey;
        this.sizeBytes = sizeBytes;
        this.mimeType = mimeType;
    }
}
