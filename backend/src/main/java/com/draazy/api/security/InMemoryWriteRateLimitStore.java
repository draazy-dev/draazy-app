package com.draazy.api.security;

import java.time.Duration;
import java.time.Instant;

public final class InMemoryWriteRateLimitStore implements WriteRateLimitStore {
    private final WriteRateLimiter delegate;

    public InMemoryWriteRateLimitStore(String namespace, int budget, Duration window) {
        this.delegate = new WriteRateLimiter(budget, window);
    }

    @Override
    public int tryAcquire(String key, Instant now) {
        return delegate.tryAcquire(key, now);
    }

    int tracked() {
        return delegate.tracked();
    }
}
