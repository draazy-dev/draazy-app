package com.draazy.api.common.error;

public class ServiceUnavailableException extends ApiException {
    private final Integer retryAfterSeconds;

    public ServiceUnavailableException(String message) {
        this(message, null);
    }

    public ServiceUnavailableException(String message, Integer retryAfterSeconds) {
        super(ErrorCodes.SERVICE_UNAVAILABLE, 503, message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public Integer getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}
