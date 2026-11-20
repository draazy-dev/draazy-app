package com.draazy.api.engagement.notification;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.Setter;

// Package-private constructor on purpose: all writes go through NotificationPublisher,
// which applies quiet hours and the alert switch.
@Entity
@Table(name = "notifications")
@Getter
public class Notification extends BaseEntity {
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "type")
    private String type;

    @Column(name = "title")
    private String title;

    @Column(name = "body")
    private String body;

    @Column(name = "read", nullable = false)
    @Setter
    private boolean read = false;

    @Column(name = "link")
    @Setter(AccessLevel.PACKAGE)
    private String link;

    @Column(name = "deliver_after")
    @Setter(AccessLevel.PACKAGE)
    private Instant deliverAfter;

    protected Notification() {}

    Notification(UUID userId, String type, String title, String body) {
        this.userId = userId;
        this.type = type;
        this.title = title;
        this.body = body;
    }
}
