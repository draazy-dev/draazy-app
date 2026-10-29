package com.draazy.api.engagement.history;

import com.draazy.api.common.persistence.AuditedEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;

@Entity
@Table(name = "recent_searches")
@Getter
public class RecentSearch extends AuditedEntity {
    @Column(name = "user_id", nullable = false, updatable = false)
    private UUID userId;

    @Column(name = "label", nullable = false, length = 200)
    private String label;

    @Column(name = "url", nullable = false, updatable = false, length = 500)
    private String url;

    @Column(name = "searched_at", nullable = false)
    private Instant searchedAt;

    protected RecentSearch() {
    }

    RecentSearch(UUID userId, String label, String url, Instant searchedAt) {
        this.userId = userId;
        this.label = label;
        this.url = url;
        this.searchedAt = searchedAt;
    }

    void touch(String label, Instant searchedAt) {
        this.label = label;
        this.searchedAt = searchedAt;
    }
}
