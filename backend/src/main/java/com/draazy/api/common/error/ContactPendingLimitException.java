package com.draazy.api.common.error;

/** 422 - the caller already has as many contact requests waiting on an owner as the platform allows at once. */
public class ContactPendingLimitException extends ApiException {

    public ContactPendingLimitException(String message) {
        super(ErrorCodes.CONTACT_PENDING_LIMIT, 422, message);
    }
}
