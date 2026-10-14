package com.draazy.api.common.error;

/** 422 - the order cannot be refunded on the customer's say-so; {@code reason} is the policy's reason code. */
public class RefundNotEligibleException extends ApiException {

    private final String reason;

    public RefundNotEligibleException(String reason, String message) {
        super(ErrorCodes.REFUND_NOT_ELIGIBLE, 422, message);
        this.reason = reason;
    }

    public String getReason() {
        return reason;
    }
}
