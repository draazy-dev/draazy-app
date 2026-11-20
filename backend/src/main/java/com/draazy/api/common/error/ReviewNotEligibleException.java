package com.draazy.api.common.error;

public class ReviewNotEligibleException extends ApiException {
    public ReviewNotEligibleException(String message) {
        super(ErrorCodes.REVIEW_NOT_ELIGIBLE, 422, message);
    }
}
