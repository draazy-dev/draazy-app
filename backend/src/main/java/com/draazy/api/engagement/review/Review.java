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

@Entity
@Table(name = "reviews")
@Getter
public class Review extends BaseEntity {
    @Column(name = "target_type", nullable = false, updatable = false)
    private String targetType;

    @Column(name = "target_id", nullable = false, updatable = false)
    private String targetId;

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

    @Column(name = "context")
    @Setter
    private String context;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "categories", nullable = false, columnDefinition = "jsonb")
    @Setter
    private String categories = "{}";

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
