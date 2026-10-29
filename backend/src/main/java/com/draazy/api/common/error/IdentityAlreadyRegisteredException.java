package com.draazy.api.common.error;

public class IdentityAlreadyRegisteredException extends ApiException {
    public IdentityAlreadyRegisteredException(String message) {
        super(ErrorCodes.IDENTITY_ALREADY_REGISTERED, 409, message);
    }
}
