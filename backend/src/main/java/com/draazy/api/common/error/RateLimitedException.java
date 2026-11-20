package com.draazy.api.common.error;

public class RateLimitedException extends ApiException {
    private final int retryAfterSeconds;

    public RateLimitedException(String message, int retryAfterSeconds) {
        this(ErrorCodes.RATE_LIMITED, message, retryAfterSeconds);
    }

    public RateLimitedException(String code, String message, int retryAfterSeconds) {
        super(code, 429, message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public int getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
