package com.draazy.api.common.audit;

import com.draazy.api.common.persistence.BatchedDelete;
import java.time.Duration;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** The accountability log is kept a year (CERT-In 180 days, DPDP Rule 6 one year), then purged, except the rows
 * code reads as state: first-approval reports, the co-fill decline guard and {@code recordOnce} dedupe. */
@Component
public class AuditLogRetention {

    private static final Logger log = LoggerFactory.getLogger(AuditLogRetention.class);

    public static final Duration RETENTION = Duration.ofDays(365);

    static final String KEPT_FOR_EVER = """
            action IN ('property.status', 'property.verification.decision', 'service-request.party-declined',
                       'serviceRequest.amountMismatch')""";

    private final JdbcTemplate jdbc;

    public AuditLogRetention(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long purgeOlderThan(Instant cutoff) {
        long removed = BatchedDelete.olderThan(jdbc, "audit_log", "at", KEPT_FOR_EVER, cutoff);
        if (removed > 0) {
            log.info("Purged {} audit entries older than {}", removed, cutoff);
        }
        return removed;
    }

    public long purgeNow() {
        return purgeOlderThan(Instant.now().minus(RETENTION));
    }
}