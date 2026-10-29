package com.draazy.api.security;

import java.time.Duration;
import java.time.Instant;

public interface WriteRateLimitStore {
    int tryAcquire(String key, Instant now);

    @FunctionalInterface
    interface Factory {
        WriteRateLimitStore create(String namespace, int budget, Duration window);
    }
}
