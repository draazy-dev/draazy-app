package com.draazy.api.identity.auth;

import com.draazy.api.common.persistence.BatchedDelete;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class OtpRetention {
    private static final Logger log = LoggerFactory.getLogger(OtpRetention.class);

    // Must outlive OtpSendBudget.SEND_DAY, which counts past sends from these rows.
    public static final Duration RETENTION = Duration.ofDays(7);

    private final JdbcTemplate jdbc;

    public OtpRetention(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long purgeOlderThan(Instant cutoff) {
        long removed = BatchedDelete.olderThan(jdbc, "otp_codes", "created_at", cutoff);
        if (removed > 0) {
            log.info("Purged {} OTP codes created before {}", removed, cutoff);
        }
        return removed;
    }

    public long purgeNow() {
        return purgeOlderThan(Instant.now().minus(RETENTION));
    }
}
