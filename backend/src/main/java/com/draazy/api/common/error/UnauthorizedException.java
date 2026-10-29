package com.draazy.api.common.error;

public class UnauthorizedException extends ApiException {
    public UnauthorizedException(String message) {
        this(ErrorCodes.UNAUTHORIZED, message);
    }

    public UnauthorizedException(String code, String message) {
        super(code, 401, message);
    }
}
