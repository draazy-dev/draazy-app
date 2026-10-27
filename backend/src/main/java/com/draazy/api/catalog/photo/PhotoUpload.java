package com.draazy.api.catalog.photo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

/** One public-bucket upload, kept until the sweep has settled whether anything shows it. */
@Entity
@Table(name = "photo_uploads")
@Getter
class PhotoUpload {

    @Id
    @Column(name = "storage_key", nullable = false, updatable = false)
    private String storageKey;

    @Column(name = "uploader_id", nullable = false, updatable = false)
    private UUID uploaderId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected PhotoUpload() {
        // JPA
    }

    PhotoUpload(String storageKey, UUID uploaderId, Instant createdAt) {
        this.storageKey = storageKey;
        this.uploaderId = uploaderId;
        this.createdAt = createdAt;
    }
}
