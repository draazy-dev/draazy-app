package com.draazy.api.common.trust;

public final class MobileMask {
    private MobileMask() {
    }

    private static final int PREFIX_KEPT = 2;

    private static final int SUFFIX_FROM = 7;

    private static final int MOBILE_LENGTH = 10;

    private static final String INFIX = "XXXXX";

    public static String normalise(String mobile) {
        if (mobile == null) {
            return null;
        }
        String digits = mobile.replaceAll("\\D", "");
        if (digits.length() > MOBILE_LENGTH) {
            String tail = digits.substring(digits.length() - MOBILE_LENGTH);
            String prefix = digits.substring(0, digits.length() - MOBILE_LENGTH);
            if (!prefix.equals("91") && !prefix.equals("091") && !prefix.equals("0091")
                    && !prefix.equals("0")) {
                return null;
            }
            digits = tail;
        }
        return digits.length() == MOBILE_LENGTH ? digits : null;
    }

    public static String mask(String mobile) {
        if (mobile == null) {
            return null;
        }
        String digits = mobile.replaceAll("\\D", "");
        if (digits.length() != MOBILE_LENGTH) {
            return null;
        }
        return digits.substring(0, PREFIX_KEPT) + INFIX + digits.substring(SUFFIX_FROM);
    }

    public static String applyTo(String mobile, ContactVisibility visibility) {
        return visibility == ContactVisibility.REVEALED ? mobile : mask(mobile);
    }
}
