package com.draazy.api.common.error;

public class ValidationException extends ApiException {
    public ValidationException(String message) {
        super(ErrorCodes.VALIDATION_FAILED, 422, message);
    }
}
