package com.draazy.api.admin.leads;

import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
class LeadRecords {
    record Row(UUID id, String mobile, UUID userId, String name, String stage, UUID ownerId, Instant nextFollowUpAt,
            Instant lastContactAt, int failedAttempts) {
    }

    private static final String LOCK = """
            select id, mobile, user_id, name, stage, owner_id, next_follow_up_at, last_contact_at, failed_attempts
              from crm_leads where id = ? for update
            """;

    private static final String ACTIVITY = """
            insert into crm_lead_activities (lead_id, actor_id, kind, outcome, body, created_at)
            values (?, ?, ?, ?, ?, clock_timestamp())
            """;

    private final JdbcTemplate jdbc;

    LeadRecords(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime value = rs.getObject(column, OffsetDateTime.class);
        return value == null ? null : value.toInstant();
    }

    Row lock(UUID id) {
        return jdbc.query(LOCK, (rs, i) -> new Row(rs.getObject("id", UUID.class), rs.getString("mobile"),
                rs.getObject("user_id", UUID.class), rs.getString("name"), rs.getString("stage"),
                rs.getObject("owner_id", UUID.class), instant(rs, "next_follow_up_at"),
                instant(rs, "last_contact_at"), rs.getInt("failed_attempts")), id)
                .stream().findFirst().orElseThrow(() -> NotFoundException.of("Lead"));
    }

    void activity(UUID leadId, UUID actorId, String kind, String outcome, String body) {
        jdbc.update(ACTIVITY, leadId, actorId, kind, outcome, body);
    }

    Row owned(UUID id, UUID callerId) {
        Row row = lock(id);
        if (!callerId.equals(row.ownerId())) {
            throw new ForbiddenException("Claim this lead first — only its owner can do that");
        }
        return row;
    }

    static OffsetDateTime at(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
