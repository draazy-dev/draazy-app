package com.draazy.api.engagement.requests;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "request_hidden")
@Getter
public class RequestHidden {

    @EmbeddedId
    private RequestHiddenKey id;

    @Column(name = "hidden_at", nullable = false)
    private Instant hiddenAt;

    protected RequestHidden() {
        // JPA
    }

    RequestHidden(UUID userId, String kind, UUID refId) {
        this.id = new RequestHiddenKey(userId, kind, refId);
        this.hiddenAt = Instant.now();
    }
}
