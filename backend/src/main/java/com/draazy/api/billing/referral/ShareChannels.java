package com.draazy.api.billing.referral;

import java.util.Set;

public final class ShareChannels {
    private ShareChannels() {
    }

    public static final String WHATSAPP = "whatsapp";

    public static final String SMS = "sms";

    public static final String EMAIL = "email";

    public static final String COPY = "copy";

    public static final String QR = "qr";

    public static final String OTHER = "other";

    private static final Set<String> ALL = Set.of(WHATSAPP, SMS, EMAIL, COPY, QR, OTHER);

    public static String normalise(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim().toLowerCase(java.util.Locale.ROOT);
        return ALL.contains(trimmed) ? trimmed : null;
    }

    public static Set<String> all() {
        return ALL;
    }
}
