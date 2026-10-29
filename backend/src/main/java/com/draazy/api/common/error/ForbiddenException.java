package com.draazy.api.common.error;

public class ForbiddenException extends ApiException {
    public ForbiddenException(String message) {
        this(ErrorCodes.FORBIDDEN, message);
    }

    public ForbiddenException(String code, String message) {
        super(code, 403, message);
    }
}
