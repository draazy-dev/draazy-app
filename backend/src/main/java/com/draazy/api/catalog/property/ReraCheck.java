package com.draazy.api.catalog.property;

import java.util.Set;

/** Staff's MahaRERA lookup result for the RERA ID a listing quotes. */
public final class ReraCheck {
    public static final String VERIFIED = "verified";
    public static final String NOT_FOUND = "not_found";
    public static final String MISMATCH = "mismatch";
    public static final Set<String> ALL = Set.of(VERIFIED, NOT_FOUND, MISMATCH);

    private ReraCheck() {
    }

    public static boolean failed(String result) {
        return NOT_FOUND.equals(result) || MISMATCH.equals(result);
    }
}
