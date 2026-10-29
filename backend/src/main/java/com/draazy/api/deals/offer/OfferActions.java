package com.draazy.api.deals.offer;

public final class OfferActions {
    private OfferActions() {
    }

    public static final String ACCEPT = "accept";

    public static final String DECLINE = "decline";

    public static final String COUNTER = "counter";

    public static final String PATTERN = "^(" + ACCEPT + "|" + DECLINE + "|" + COUNTER + ")$";

    public static final String PATTERN_MESSAGE = "must be accept, decline or counter";
}
