package com.draazy.api.security;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

// Increment, expiry and TTL read must stay one atomic Lua script: INCR then EXPIRE can strand
// a TTL-less key that blocks a caller permanently.
public final class RedisWriteRateLimitStore implements WriteRateLimitStore {
    static final String SCRIPT = """
            local n = redis.call('INCR', KEYS[1])
            local t = redis.call('PTTL', KEYS[1])
            if t < 0 then
              redis.call('PEXPIRE', KEYS[1], ARGV[1])
              t = tonumber(ARGV[1])
            end
            return {n, t}
            """;

    private static final Logger log = LoggerFactory.getLogger(RedisWriteRateLimitStore.class);

    private static final String KEY_PREFIX = "pn:rl:";

    private final RedisEval redis;
    private final String namespace;
    private final int budget;
    private final Duration window;

    private final WriteRateLimitStore fallback;

    public RedisWriteRateLimitStore(RedisEval redis, String namespace, int budget, Duration window) {
        if (budget < 1) {
            throw new IllegalArgumentException("rate-limit budget must be at least 1, got " + budget);
        }
        if (window == null || window.isZero() || window.isNegative()) {
            throw new IllegalArgumentException("rate-limit window must be positive, got " + window);
        }
        this.redis = redis;
        this.namespace = namespace;
        this.budget = budget;
        this.window = window;
        this.fallback = new InMemoryWriteRateLimitStore(namespace, budget, window);
    }

    @Override
    public int tryAcquire(String key, Instant now) {
        List<Long> reply;
        try {
            reply = redis.eval(SCRIPT,
                    List.of(KEY_PREFIX + namespace + ':' + key),
                    List.of(Long.toString(window.toMillis())));
        } catch (RuntimeException e) {
            log.error("Redis rate-limit store unavailable; falling back to per-instance counting", e);
            return fallback.tryAcquire(key, now);
        }
        if (reply == null || reply.size() < 2 || reply.get(0) == null || reply.get(1) == null) {
            log.error("Redis rate-limit store returned an unexpected reply: {}", reply);
            return fallback.tryAcquire(key, now);
        }

        long used = reply.get(0);
        if (used <= budget) {
            return 0;
        }
        long remainingMillis = reply.get(1);
        return (int) Math.max(1, (remainingMillis + 999) / 1000);
    }
}
