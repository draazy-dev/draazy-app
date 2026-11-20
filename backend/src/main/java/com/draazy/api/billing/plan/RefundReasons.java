package com.draazy.api.billing.plan;

final class RefundReasons {
    static final String PAID_AFTER_CANCEL = "paid_after_cancel";
    static final String LISTING_GONE = "listing_gone";
    static final String AMOUNT_MISMATCH = "amount_mismatch";
    static final String CUSTOMER_REQUEST = "customer_request";
    static final String GATEWAY_DASHBOARD = "gateway_dashboard";

    private RefundReasons() {
    }
}
