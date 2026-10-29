package com.draazy.api.admin;

import java.time.LocalDate;
import java.util.List;

public record AdminAnalyticsSurfers(
        int days,
        LocalDate from,
        LocalDate to,
        long totalSessions,
        long anonSessions,
        long signedInSessions,
        long signups,
        Double anonSharePct,
        Double conversionRatePct,
        List<Page> pages,
        List<Exit> dropOff) {
    public record Page(String path, long views, long anonViews) {
    }

    public record Exit(String path, long exits, double sharePct) {
    }
}
