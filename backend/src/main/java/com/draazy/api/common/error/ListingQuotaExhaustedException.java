package com.draazy.api.common.error;

public class ListingQuotaExhaustedException extends ApiException {
    public ListingQuotaExhaustedException(String message) {
        super(ErrorCodes.LISTING_QUOTA_EXHAUSTED, 422, message);
    }
}
