package com.draazy.api.engagement.review;

import com.draazy.api.identity.user.User;
import java.time.Instant;

public record ReviewModerationRow(
        String id,
        String targetType,
        String targetId,
        String author,
        String authorMobile,
        int rating,
        String body,
        Instant createdAt,
        String status) {
    static ReviewModerationRow of(Review r, User author) {
        return new ReviewModerationRow(r.getId().toString(), r.getTargetType(), r.getTargetId(),
                author == null ? null : author.getName(), author == null ? null : author.getMobile(),
                r.getRating(), r.getBody(), r.getCreatedAt(), r.getStatus());
    }
}
