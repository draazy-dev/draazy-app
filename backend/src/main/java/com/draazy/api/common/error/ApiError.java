package com.draazy.api.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(String error, String message, int status, String traceId,
        Integer attemptsRemaining, Integer retryAfterSeconds, String reason, String existingId,
        String nextReminderAt) {
    public ApiError(String error, String message, int status, String traceId,
            Integer attemptsRemaining, Integer retryAfterSeconds, String reason) {
        this(error, message, status, traceId, attemptsRemaining, retryAfterSeconds, reason, null, null);
    }

    public ApiError(String error, String message, int status, String traceId) {
        this(error, message, status, traceId, null, null, null, null, null);
    }
}
