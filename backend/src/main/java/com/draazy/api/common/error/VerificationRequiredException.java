package com.draazy.api.common.error;

public class VerificationRequiredException extends ApiException {
    public VerificationRequiredException(String message) {
        super(ErrorCodes.VERIFICATION_REQUIRED, 403, message);
    }
}
