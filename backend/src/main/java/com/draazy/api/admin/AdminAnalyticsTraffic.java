package com.draazy.api.admin;

import java.time.LocalDate;
import java.util.List;

public record AdminAnalyticsTraffic(
        int days,
        LocalDate from,
        LocalDate to,
        List<Day> series,
        List<Source> sources,
        Devices devices,
        List<IdentityWeek> identity) {
    public record Day(LocalDate date, long sessions, long pageviews, long signups) {
    }

    public record Source(String channel, long sessions, double sharePct) {
    }

    public record Devices(long mobile, long tablet, long desktop) {
    }

    public record IdentityWeek(LocalDate week, long anonymous, long signedIn) {
    }
}
