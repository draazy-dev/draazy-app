package com.draazy.api.engagement.pageview;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.UuidGenerator;

@Entity
@Table(name = "page_views")
@Getter
public class PageView {
    @Id
    @UuidGenerator
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "session_id", nullable = false, updatable = false)
    @Setter
    private String sessionId;

    @Column(name = "user_id")
    @Setter
    private UUID userId;

    @Column(name = "signed_in", nullable = false, updatable = false)
    @Setter
    private boolean signedIn;

    // Matched route only: a query string can carry personal data, so the service strips ? and # too.
    @Column(name = "path", nullable = false, updatable = false)
    @Setter
    private String path;

    @Column(name = "referrer_host", updatable = false)
    @Setter
    private String referrerHost;

    @Column(name = "device", nullable = false, updatable = false)
    @Setter
    private String device;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    @Setter
    private Instant occurredAt;
}
