package com.draazy.api.documents.agreement;

import java.util.List;
import java.util.Map;

public final class RentAgreementStatuses {
    private RentAgreementStatuses() {
    }

    public static final String DRAFT = "draft";
    public static final String E_SIGN_PENDING = "e-sign-pending";
    public static final String REGISTERED = "registered";
    public static final String ACTIVE = "active";
    public static final String EXPIRED = "expired";

    private static final Map<String, List<String>> NEXT = Map.of(
            DRAFT, List.of(E_SIGN_PENDING, REGISTERED, EXPIRED),
            E_SIGN_PENDING, List.of(REGISTERED, EXPIRED),
            REGISTERED, List.of(ACTIVE, EXPIRED),
            ACTIVE, List.of(EXPIRED),
            EXPIRED, List.of());

    public static final List<String> ALL =
            List.of(DRAFT, E_SIGN_PENDING, REGISTERED, ACTIVE, EXPIRED);

    public static boolean isKnown(String status) {
        return NEXT.containsKey(status);
    }

    public static boolean canMove(String from, String to) {
        return NEXT.getOrDefault(from, List.of()).contains(to);
    }

    public static List<String> nextFrom(String from) {
        return NEXT.getOrDefault(from, List.of());
    }
}
