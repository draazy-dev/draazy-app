package com.draazy.api.services.request;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "service_request_timeline")
@Getter
public class ServiceRequestEvent {
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @CreationTimestamp
    @Column(name = "at", nullable = false, updatable = false)
    private Instant at;

    @Column(name = "event", nullable = false, updatable = false)
    private String event;

    @Column(name = "by", updatable = false)
    private String by;

    protected ServiceRequestEvent() {
    }

    ServiceRequestEvent(UUID requestId, String event, String by) {
        this.requestId = requestId;
        this.event = event;
        this.by = by;
    }
}
