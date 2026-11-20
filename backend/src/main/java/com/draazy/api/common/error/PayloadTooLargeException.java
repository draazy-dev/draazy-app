package com.draazy.api.common.error;

import org.springframework.http.HttpStatus;

public class PayloadTooLargeException extends ApiException {
    public PayloadTooLargeException(String message) {
        super(ErrorCodes.PAYLOAD_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE.value(), message);
    }
}
