package com.draazy.api.engagement.messaging;

import com.draazy.api.common.persistence.BatchedDelete;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class OutboundMessageRetention {
    private static final Logger log = LoggerFactory.getLogger(OutboundMessageRetention.class);

    public static final Duration RETENTION = Duration.ofDays(180);

    private final JdbcTemplate jdbc;

    public OutboundMessageRetention(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long purgeOlderThan(Instant cutoff) {
        long removed = BatchedDelete.olderThan(jdbc, "outbound_message", "prepared_at", cutoff);
        if (removed > 0) {
            log.info("Purged {} outbound messages prepared before {}", removed, cutoff);
        }
        return removed;
    }

    public long purgeNow() {
        return purgeOlderThan(Instant.now().minus(RETENTION));
    }
}
