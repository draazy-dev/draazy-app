package com.draazy.api.engagement.notification;

import com.draazy.api.common.PlatformTime;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZonedDateTime;
import java.time.format.DateTimeParseException;
import java.util.Optional;

final class QuietHours {
    private QuietHours() {
    }

    static Optional<Instant> deferUntil(NotificationPreferencesDto prefs, Instant at) {
        QuietHoursDto window = prefs.quietHours();
        if (window == null || !window.enabled()) {
            return Optional.empty();
        }
        LocalTime start = wallClock(window.start());
        LocalTime end = wallClock(window.end());
        if (start == null || end == null || start.equals(end)) {
            return Optional.empty();
        }
        ZonedDateTime local = at.atZone(PlatformTime.IST);
        LocalTime now = local.toLocalTime();
        boolean inside = start.isBefore(end)
                ? (!now.isBefore(start) && now.isBefore(end))
                : (!now.isBefore(start) || now.isBefore(end));
        if (!inside) {
            return Optional.empty();
        }
        ZonedDateTime closes = local.toLocalDate().atTime(end).atZone(PlatformTime.IST);
        if (!closes.isAfter(local)) {
            closes = closes.plusDays(1);
        }
        return Optional.of(closes.toInstant());
    }

    private static LocalTime wallClock(String label) {
        try {
            return LocalTime.parse(label);
        } catch (DateTimeParseException | NullPointerException notATime) {
            return null;
        }
    }
}
