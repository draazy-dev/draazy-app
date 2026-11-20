package com.draazy.api.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

public final class PostgresWriteRateLimitStore implements WriteRateLimitStore {
    // One statement so increment, window reset and read are atomic under the row lock.
    static final String UPSERT = """
            INSERT INTO rate_limit_counters (bucket, hits, window_end) VALUES (?, 1, ?)
            ON CONFLICT (bucket) DO UPDATE SET
              hits = CASE WHEN rate_limit_counters.window_end <= ? THEN 1 ELSE rate_limit_counters.hits + 1 END,
              window_end = CASE WHEN rate_limit_counters.window_end <= ? THEN EXCLUDED.window_end
                                ELSE rate_limit_counters.window_end END
            RETURNING hits, window_end
            """;

    private static final Logger log = LoggerFactory.getLogger(PostgresWriteRateLimitStore.class);

    private final JdbcTemplate jdbc;
    private final TransactionTemplate ownTx;
    private final String namespace;
    private final int budget;
    private final Duration window;
    private final WriteRateLimitStore fallback;

    public PostgresWriteRateLimitStore(JdbcTemplate jdbc, TransactionTemplate ownTx,
            String namespace, int budget, Duration window) {
        this.fallback = new InMemoryWriteRateLimitStore(namespace, budget, window);
        this.jdbc = jdbc;
        this.ownTx = ownTx;
        this.namespace = namespace;
        this.budget = budget;
        this.window = window;
    }

    @Override
    public int tryAcquire(String key, Instant now) {
        Timestamp at = Timestamp.from(now);
        Counter counter;
        try {
            counter = ownTx.execute(status -> jdbc.queryForObject(UPSERT,
                    (rs, i) -> new Counter(rs.getInt(1), rs.getTimestamp(2).toInstant()),
                    bucket(key), Timestamp.from(now.plus(window)), at, at));
        } catch (DataAccessException e) {
            log.error("Postgres rate-limit store unavailable; falling back to per-instance counting", e);
            return fallback.tryAcquire(key, now);
        }
        if (counter == null) {
            return fallback.tryAcquire(key, now);
        }
        if (counter.hits <= budget) {
            return 0;
        }
        long millis = Duration.between(now, counter.windowEnd).toMillis();
        return (int) Math.max(1, (millis + 999) / 1000);
    }

    // Keys can be a caller's IP or mobile; only a digest is persisted.
    private String bucket(String key) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((namespace + ':' + key).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private record Counter(int hits, Instant windowEnd) {
    }
}
