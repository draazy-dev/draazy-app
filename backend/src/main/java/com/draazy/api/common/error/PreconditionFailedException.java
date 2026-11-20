package com.draazy.api.common.error;

public class PreconditionFailedException extends ApiException {
    public PreconditionFailedException(String message) {
        super(ErrorCodes.PRECONDITION_FAILED, 412, message);
    }
}
