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

/** A user's persisted search with optional alert preferences. Hard-deleted (no archived column): it is a
 * personal preference, not an auditable record; updated_at is mapped here because there is no archived triplet. */
@Entity
@Table(name = "saved_searches")
@Getter
public class SavedSearch extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "name")
    @Setter
    private String name;

    /** Nullable since V27: a flatmates alert carries {@link #criteria} instead. */
    @Column(name = "query")
    private String query;

    // A listings alert is a URL query string; a flatmates alert is a criteria object, so the kind is explicit.
    @Column(name = "kind", nullable = false)
    @Setter
    private String kind = "listings";

    /** Contract {@code FlatmateAlertCriteria}, stored whole. Required when {@link #kind} is flatmates. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "criteria", columnDefinition = "jsonb")
    @Setter
    private String criteria;

    /** Short human summary rendered on the alert card, e.g. "Move in now · Baner · Verified". */
    @Column(name = "label")
    @Setter
    private String label;

    // Signed-out alerts are keyed by mobile so they re-home on sign-in; null for signed-in callers.
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

    // When the sweep last published an alert; the next count starts here, or at creation if never alerted.
    // Published, not delivered: quiet hours may defer it, and a second alert on top would be the bug.
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

    // A separate factory so a listings-shaped row can't reach the kind CHECK constraint and fail at flush.
    static SavedSearch forFlatmates(UUID userId, String criteria, String label) {
        SavedSearch entity = new SavedSearch();
        entity.userId = userId;
        entity.kind = "flatmates";
        entity.criteria = criteria;
        entity.label = label;
        return entity;
    }

}
