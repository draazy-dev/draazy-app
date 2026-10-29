package com.draazy.api.services.request;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "service_request_messages")
@Getter
public class ServiceRequestMessage extends BaseEntity {
    @Column(name = "request_id", nullable = false, updatable = false)
    private UUID requestId;

    @Column(name = "author_id", updatable = false)
    private UUID authorId;

    @Column(name = "author_role", updatable = false)
    private String authorRole;

    @Column(name = "body", nullable = false, updatable = false)
    private String body;

    @Column(name = "read_at")
    private Instant readAt;

    protected ServiceRequestMessage() {
    }

    ServiceRequestMessage(UUID requestId, UUID authorId, String authorRole, String body) {
        this.requestId = requestId;
        this.authorId = authorId;
        this.authorRole = authorRole;
        this.body = body;
    }
}
