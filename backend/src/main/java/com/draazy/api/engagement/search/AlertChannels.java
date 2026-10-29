package com.draazy.api.engagement.search;

public final class AlertChannels {
    private AlertChannels() {
    }

    public static final String WHATSAPP = "whatsapp";

    public static final String SMS = "sms";

    public static final String EMAIL = "email";

    public static final String PUSH = "push";

    public static final String PATTERN = WHATSAPP + "|" + SMS + "|" + EMAIL + "|" + PUSH;

    public static final String PATTERN_MESSAGE = "must be whatsapp, sms, email or push";
}
