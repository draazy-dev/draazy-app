package com.draazy.api.security;

import com.draazy.api.common.persistence.BatchedDelete;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class RateLimitCounterRetention {
    private final JdbcTemplate jdbc;

    public RateLimitCounterRetention(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long purgeExpired() {
        return BatchedDelete.olderThan(jdbc, "rate_limit_counters", "window_end", Instant.now());
    }
}
