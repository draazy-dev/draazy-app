package com.draazy.api.common.error;

public class ContactPendingLimitException extends ApiException {
    public ContactPendingLimitException(String message) {
        super(ErrorCodes.CONTACT_PENDING_LIMIT, 422, message);
    }
}
