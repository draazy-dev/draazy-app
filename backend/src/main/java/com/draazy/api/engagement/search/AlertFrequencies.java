package com.draazy.api.engagement.search;

public final class AlertFrequencies {
    private AlertFrequencies() {
    }

    public static final String OFF = "off";

    public static final String INSTANT = "instant";

    public static final String DAILY = "daily";

    public static final String WEEKLY = "weekly";

    public static final String PATTERN = OFF + "|" + INSTANT + "|" + DAILY + "|" + WEEKLY;

    public static final String PATTERN_MESSAGE = "must be off, instant, daily or weekly";
}
