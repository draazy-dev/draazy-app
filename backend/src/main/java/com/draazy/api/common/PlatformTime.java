package com.draazy.api.common;

import com.draazy.api.common.error.BadRequestException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

public final class PlatformTime {
    public static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    public static final int MAX_WINDOW_DAYS = 3660;

    private PlatformTime() {
    }

    public static Instant windowStart(int days) {
        return windowStart(days, Instant.now());
    }

    public static Instant sinceOrNull(Integer days) {
        if (days == null || days < 1) return null;
        if (days > MAX_WINDOW_DAYS) throw new BadRequestException("days must be at most " + MAX_WINDOW_DAYS);
        return windowStart(days);
    }

    static Instant windowStart(int days, Instant now) {
        return LocalDate.ofInstant(now, IST).minusDays(days - 1L).atStartOfDay(IST).toInstant();
    }
}
