package com.draazy.api.engagement.requests;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "request_reminders")
@Getter
public class RequestReminder {

    @Id
    @UuidGenerator
    private UUID id;

    @Column(name = "kind", nullable = false, updatable = false)
    private String kind;

    @Column(name = "ref_id", nullable = false, updatable = false)
    private UUID refId;

    @Column(name = "requester_id", nullable = false, updatable = false)
    private UUID requesterId;

    @Column(name = "recipient_id", nullable = false, updatable = false)
    private UUID recipientId;

    @Column(name = "notified", nullable = false, updatable = false)
    private boolean notified;

    @Column(name = "sent_at", nullable = false, updatable = false)
    private Instant sentAt;

    protected RequestReminder() {
        // JPA
    }

    RequestReminder(String kind, UUID refId, UUID requesterId, UUID recipientId, boolean notified, Instant sentAt) {
        this.kind = kind;
        this.refId = refId;
        this.requesterId = requesterId;
        this.recipientId = recipientId;
        this.notified = notified;
        this.sentAt = sentAt;
    }
}
