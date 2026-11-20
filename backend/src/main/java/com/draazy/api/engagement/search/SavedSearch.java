package com.draazy.api.engagement.search;

import com.draazy.api.common.persistence.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "saved_searches")
@Getter
public class SavedSearch extends BaseEntity {
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "name")
    @Setter
    private String name;

    @Column(name = "query")
    @Setter
    private String query;

    @Column(name = "kind", nullable = false)
    @Setter
    private String kind = "listings";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "criteria", columnDefinition = "jsonb")
    @Setter
    private String criteria;

    @Column(name = "label")
    @Setter
    private String label;

    @Column(name = "mobile")
    @Setter
    private String mobile;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "filters", nullable = false, columnDefinition = "jsonb")
    @Setter
    private String filters = "{}";

    @Column(name = "alert_frequency", nullable = false)
    @Setter
    private String alertFrequency = "daily";

    @Column(name = "channel", nullable = false)
    @Setter
    private String channel = AlertChannels.PUSH;

    @Column(name = "new_count", nullable = false)
    @Setter
    private int newCount = 0;

    @Column(name = "last_alerted_at")
    @Setter
    private Instant lastAlertedAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected SavedSearch() {}

    public SavedSearch(UUID userId, String query) {
        this.userId = userId;
        this.query = query;
    }

    static SavedSearch forFlatmates(UUID userId, String criteria, String label) {
        SavedSearch entity = new SavedSearch();
        entity.userId = userId;
        entity.kind = "flatmates";
        entity.criteria = criteria;
        entity.label = label;
        return entity;
    }
}
