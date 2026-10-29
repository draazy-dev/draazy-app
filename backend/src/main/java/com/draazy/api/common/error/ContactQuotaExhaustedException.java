package com.draazy.api.common.error;

public class ContactQuotaExhaustedException extends ApiException {
    public ContactQuotaExhaustedException(String message) {
        super(ErrorCodes.CONTACT_QUOTA_EXHAUSTED, 422, message);
    }
}
