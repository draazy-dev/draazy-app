package com.draazy.api.catalog.property;

public final class MeterKey {
    private static final int MIN_DIGITS = 6;

    private MeterKey() {
    }

    public static String of(String meterNo) {
        if (meterNo == null) {
            return null;
        }
        String digits = meterNo.replaceAll("\\D", "");
        return digits.length() < MIN_DIGITS ? null : digits;
    }
}
