package com.draazy.api.moderation.errorlog;

import com.draazy.api.common.audit.AuditMetadata;
import com.draazy.api.common.persistence.LikePatterns;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ErrorLogRepository {
    public enum Status { OPEN, RESOLVED, ALL }

    private static final RowMapper<ErrorEventSummary> SUMMARY = (rs, i) -> new ErrorEventSummary(
            rs.getObject("id", UUID.class), rs.getString("source"), rs.getString("error_type"),
            rs.getString("message"), rs.getString("path"), rs.getInt("occurrences"),
            instant(rs, "first_seen"), instant(rs, "last_seen"), rs.getString("last_trace_id"),
            instant(rs, "resolved_at"));

    private static final RowMapper<ErrorEventDetail> DETAIL = (rs, i) -> new ErrorEventDetail(
            rs.getObject("id", UUID.class), rs.getString("fingerprint"), rs.getString("source"),
            rs.getString("level"), rs.getString("error_type"), rs.getString("message"), rs.getString("stack"),
            rs.getString("path"), rs.getString("http_method"), (Integer) rs.getObject("http_status"),
            rs.getString("build"), rs.getString("user_role"), rs.getObject("last_user_id", UUID.class),
            rs.getString("last_trace_id"), AuditMetadata.parse(rs.getString("context")),
            rs.getInt("occurrences"), instant(rs, "first_seen"), instant(rs, "last_seen"),
            instant(rs, "resolved_at"), rs.getObject("resolved_by", UUID.class));

    private static final String FILTER = """
             WHERE (cast(:source as text) IS NULL OR source = cast(:source as text))
               AND (NOT cast(:openOnly as boolean) OR resolved_at IS NULL)
               AND (NOT cast(:resolvedOnly as boolean) OR resolved_at IS NOT NULL)
               AND (cast(:since as timestamptz) IS NULL OR last_seen >= cast(:since as timestamptz))
               AND (cast(:pattern as text) IS NULL
                    OR (message ILIKE cast(:pattern as text) OR error_type ILIKE cast(:pattern as text)
                        OR path ILIKE cast(:pattern as text) OR last_trace_id ILIKE cast(:pattern as text)
                        OR fingerprint ILIKE cast(:pattern as text)
                        OR context->>'reference' ILIKE cast(:referencePattern as text)))
            """;

    private static final String COUNT = "SELECT count(*) FROM error_event" + FILTER;

    private static final String SEARCH = "SELECT id, source, error_type, message, path, occurrences, first_seen,"
            + " last_seen, last_trace_id, resolved_at FROM error_event" + FILTER
            + " ORDER BY last_seen DESC, id LIMIT :limit OFFSET :offset";

    private final NamedParameterJdbcTemplate jdbc;

    public ErrorLogRepository(JdbcTemplate jdbc) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
    }

    public Page<ErrorEventSummary> search(String source, Status status, String q, Instant since, Pageable pageable) {
        String pattern = LikePatterns.contains(q);
        MapSqlParameterSource params = new MapSqlParameterSource("source", source)
                .addValue("openOnly", status == Status.OPEN)
                .addValue("resolvedOnly", status == Status.RESOLVED)
                .addValue("since", since == null ? null : Timestamp.from(since))
                .addValue("pattern", pattern)
                .addValue("referencePattern", pattern == null ? null : pattern.substring(1));

        Long total = jdbc.queryForObject(COUNT, params, Long.class);
        params.addValue("limit", pageable.getPageSize()).addValue("offset", pageable.getOffset());
        List<ErrorEventSummary> rows = jdbc.query(SEARCH, params, SUMMARY);
        return new PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    public Optional<ErrorEventDetail> find(UUID id) {
        return jdbc.query("SELECT * FROM error_event WHERE id = :id", new MapSqlParameterSource("id", id), DETAIL)
                .stream().findFirst();
    }

    public boolean resolve(UUID id, UUID by) {
        return jdbc.update("UPDATE error_event SET resolved_at = now(), resolved_by = :by WHERE id = :id",
                new MapSqlParameterSource("by", by).addValue("id", id)) == 1;
    }

    private static java.time.Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toInstant();
    }
}
