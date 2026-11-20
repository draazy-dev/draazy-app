package com.draazy.api.security;

import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

public class WriteRateLimiter {
    private static final int MAX_TRACKED = 50_000;

    private static final Duration MAX_WINDOW = Duration.ofDays(1);

    private final int budget;
    private final Duration window;

    private final Map<String, Counter> counters = new LinkedHashMap<>(256, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Counter> eldest) {
            return size() > MAX_TRACKED;
        }
    };

    public WriteRateLimiter(int budget, Duration window) {
        if (budget < 1) {
            throw new IllegalArgumentException("rate-limit budget must be at least 1, got " + budget);
        }
        if (window == null || window.isZero() || window.isNegative()) {
            throw new IllegalArgumentException("rate-limit window must be positive, got " + window);
        }
        if (window.compareTo(MAX_WINDOW) > 0) {
            throw new IllegalArgumentException(
                    "rate-limit window must be at most " + MAX_WINDOW + ", got " + window);
        }
        this.budget = budget;
        this.window = window;
    }

    public int tryAcquire(String key, Instant now) {
        synchronized (counters) {
            Counter counter = counters.computeIfAbsent(key, ignored -> new Counter(now));
            if (!now.isBefore(counter.windowStart.plus(window))) {
                counter.windowStart = now;
                counter.used = 0;
            }
            counter.used++;
            if (counter.used <= budget) {
                return 0;
            }
            long millis = Duration.between(now, counter.windowStart.plus(window)).toMillis();
            return (int) Math.max(1, (millis + 999) / 1000);
        }
    }

    int tracked() {
        synchronized (counters) {
            return counters.size();
        }
    }

    private static final class Counter {
        private Instant windowStart;
        private int used;

        private Counter(Instant windowStart) {
            this.windowStart = windowStart;
        }
    }
}
