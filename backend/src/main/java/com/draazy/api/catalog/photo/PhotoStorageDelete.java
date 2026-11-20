package com.draazy.api.catalog.photo;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;

@Entity
@Table(name = "photo_storage_deletes")
public class PhotoStorageDelete {

    @Id
    @Column(name = "url", nullable = false, updatable = false)
    private String url;

    @Column(name = "queued_at", nullable = false, updatable = false)
    private Instant queuedAt;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error")
    private String lastError;

    protected PhotoStorageDelete() {
    }

    public String getUrl() {
        return url;
    }

    public int getAttempts() {
        return attempts;
    }
}
