package com.draazy.api.common.error;

import com.fasterxml.jackson.annotation.JsonInclude;

/** The OpenAPI {@code Error} schema; absent fields are omitted. Optional hints live in the body. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record ApiError(String error, String message, int status, String traceId,
        Integer attemptsRemaining, Integer retryAfterSeconds, String reason) {

    /** The shape every error but a rejected OTP or a rate limit has: no hint to report. */
    public ApiError(String error, String message, int status, String traceId) {
        this(error, message, status, traceId, null, null, null);
    }
}
