package com.draazy.api.moderation.verification;

import com.draazy.api.common.trust.SupportActivity;
import com.draazy.api.common.trust.SupportActivity.Side;
import jakarta.persistence.PostPersist;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Every owner-visible review message, whoever writes it, is a message in that owner's support chat. */
@Component
public class ReviewMessageActivity {
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public ReviewMessageActivity(NamedParameterJdbcTemplate jdbc, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.events = events;
    }

    @PostPersist
    void persisted(ReviewMessage message) {
        if (message.isInternal()) {
            return;
        }
        List<SupportActivity> found = jdbc.query("""
                select user_id, about_type, about_id from support_review_owners
                 where review_id = :review and user_id is not null
                """, new MapSqlParameterSource("review", message.reviewId()), (rs, row) -> {
            UUID owner = rs.getObject("user_id", UUID.class);
            boolean fromOwner = owner.equals(message.getSenderId());
            Instant at = message.getCreatedAt() == null ? Instant.now() : message.getCreatedAt();
            return new SupportActivity(owner, fromOwner ? Side.USER : Side.STAFF,
                    fromOwner ? null : message.getSenderId(), rs.getString("about_type"),
                    rs.getString("about_id"), message.getBody(), at);
        });
        found.stream().findFirst().ifPresent(events::publishEvent);
    }
}
