package com.draazy.api.moderation.verification;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Id;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "review_messages")
@Getter
public class ReviewMessage {
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(optional = false)
    @JoinColumn(name = "review_id", nullable = false, updatable = false)
    @Getter(AccessLevel.NONE)
    private PropertyReview review;

    @Column(name = "sender_id", updatable = false)
    private UUID senderId;

    @Column(name = "body", nullable = false, updatable = false)
    private String body;

    @Column(name = "internal", nullable = false, updatable = false)
    private boolean internal;

    @Column(name = "clarification_requested", nullable = false, updatable = false)
    private boolean clarificationRequested;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "read_at")
    private Instant readAt;

    protected ReviewMessage() {
    }

    ReviewMessage(PropertyReview review, UUID senderId, String body, boolean internal,
            boolean clarificationRequested) {
        this.review = review;
        this.senderId = senderId;
        this.body = body;
        this.internal = internal;
        this.clarificationRequested = clarificationRequested;
    }

    public void markRead() {
        if (readAt == null) {
            readAt = Instant.now();
        }
    }
}
