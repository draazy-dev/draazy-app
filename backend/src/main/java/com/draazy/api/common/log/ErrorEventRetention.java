package com.draazy.api.common.log;

import com.draazy.api.common.persistence.BatchedDelete;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Captured errors are for triage, not record-keeping: every row goes 30 days after it was first seen. A fault
 * still happening comes straight back as a new row, and nothing can keep a row alive by repeating it. */
@Component
public class ErrorEventRetention {

    private static final Logger log = LoggerFactory.getLogger(ErrorEventRetention.class);

    public static final Duration RETENTION = Duration.ofDays(30);

    private final JdbcTemplate jdbc;

    public ErrorEventRetention(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long purgeOlderThan(Instant cutoff) {
        long removed = BatchedDelete.olderThan(jdbc, "error_event", "first_seen", cutoff);
        if (removed > 0) {
            log.info("Purged {} error events first seen before {}", removed, cutoff);
        }
        return removed;
    }

    public long purgeNow() {
        return purgeOlderThan(Instant.now().minus(RETENTION));
    }
}