package com.draazy.api.moderation.errorlog;

import com.draazy.api.common.audit.AuditMetadata;
import com.draazy.api.common.persistence.LikePatterns;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
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

    private final JdbcTemplate jdbc;

    public ErrorLogRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Page<ErrorEventSummary> search(String source, Status status, String q, Instant since, Pageable pageable) {
        StringBuilder where = new StringBuilder(" WHERE 1 = 1");
        List<Object> args = new ArrayList<>();
        if (source != null) {
            where.append(" AND source = ?");
            args.add(source);
        }
        if (status == Status.OPEN) {
            where.append(" AND resolved_at IS NULL");
        } else if (status == Status.RESOLVED) {
            where.append(" AND resolved_at IS NOT NULL");
        }
        if (since != null) {
            where.append(" AND last_seen >= ?");
            args.add(Timestamp.from(since));
        }
        String pattern = LikePatterns.contains(q);
        if (pattern != null) {
            where.append(" AND (message ILIKE ? OR error_type ILIKE ? OR path ILIKE ?"
                    + " OR last_trace_id ILIKE ? OR fingerprint ILIKE ? OR context->>'reference' ILIKE ?)");
            for (int i = 0; i < 5; i++) {
                args.add(pattern);
            }
            // The user-quoted crash reference is matched from its start, not anywhere inside it.
            args.add(pattern.substring(1));
        }

        Long total = jdbc.queryForObject("SELECT count(*) FROM error_event" + where, Long.class, args.toArray());
        List<Object> pageArgs = new ArrayList<>(args);
        pageArgs.add(pageable.getPageSize());
        pageArgs.add(pageable.getOffset());
        List<ErrorEventSummary> rows = jdbc.query(
                "SELECT id, source, error_type, message, path, occurrences, first_seen, last_seen,"
                        + " last_trace_id, resolved_at FROM error_event" + where
                        + " ORDER BY last_seen DESC, id LIMIT ? OFFSET ?",
                SUMMARY, pageArgs.toArray());
        return new PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    public Optional<ErrorEventDetail> find(UUID id) {
        return jdbc.query("SELECT * FROM error_event WHERE id = ?", DETAIL, id).stream().findFirst();
    }

    public boolean resolve(UUID id, UUID by) {
        return jdbc.update("UPDATE error_event SET resolved_at = now(), resolved_by = ? WHERE id = ?",
                by, id) == 1;
    }

    private static java.time.Instant instant(ResultSet rs, String column) throws SQLException {
        Timestamp ts = rs.getTimestamp(column);
        return ts == null ? null : ts.toInstant();
    }
}
