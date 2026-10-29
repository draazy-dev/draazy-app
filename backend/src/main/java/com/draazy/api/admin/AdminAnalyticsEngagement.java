package com.draazy.api.admin;

import java.time.LocalDate;
import java.util.List;

public record AdminAnalyticsEngagement(
        int days,
        LocalDate from,
        LocalDate to,
        List<Week> weeks,
        List<Page> topPages) {
    public record Week(LocalDate week, long sessions, Double avgSessionMinutes, Double bounceRatePct) {
    }

    public record Page(String path, long views, long anonViews) {
    }
}
