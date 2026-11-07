package com.draazy.api.common.error;

public class ValidationException extends ApiException {
    public ValidationException(String message) {
        super(ErrorCodes.VALIDATION_FAILED, 422, message);
    }

    public ValidationException(String code, String message) {
        super(code, 422, message);
    }
}
