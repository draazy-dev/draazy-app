package com.draazy.api.engagement.review;

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

/** {@code target_id} is text (a locality key is its slug); {@code context} is server-written and stored, so a
 *  badge outlives the lease. An author's delete removes the row, freeing the one-per-author index. */
@Entity
@Table(name = "reviews")
@Getter
public class Review extends BaseEntity {

    @Column(name = "target_type", nullable = false, updatable = false)
    private String targetType;

    @Column(name = "target_id", nullable = false, updatable = false)
    private String targetId;

    /** Nullable in the schema for seeded/legacy rows; every review this API writes has an author. */
    @Column(name = "author_id", updatable = false)
    private UUID authorId;

    @Column(name = "rating", nullable = false)
    @Setter
    private int rating;

    @Column(name = "title")
    @Setter
    private String title;

    @Column(name = "body")
    @Setter
    private String body;

    @Column(name = "status", nullable = false)
    @Setter
    private String status = ReviewStatuses.PUBLISHED;

    /** Server-derived badge: {@code visit} | {@code tenant}, or null for non-property targets. */
    @Column(name = "context")
    @Setter
    private String context;

    /** Sparse per-aspect sub-ratings as a JSON object; {@code "{}"} when none were given. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "categories", nullable = false, columnDefinition = "jsonb")
    @Setter
    private String categories = "{}";

    /** Nullable on purpose — "did not say" is a different answer from "would not recommend". */
    @Column(name = "recommend")
    @Setter
    private Boolean recommend;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected Review() {
    }

    public Review(String targetType, String targetId, UUID authorId, int rating) {
        this.targetType = targetType;
        this.targetId = targetId;
        this.authorId = authorId;
        this.rating = rating;
    }

}
