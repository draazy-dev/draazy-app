package com.draazy.api.common.error;

public class AlreadyReviewedException extends ApiException {
    public AlreadyReviewedException(String message) {
        super(ErrorCodes.ALREADY_REVIEWED, 409, message);
    }
}
