package com.draazy.api.common;

import com.draazy.api.common.error.BadRequestException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** Every user-facing date is reckoned in IST: a bare {@code LocalDate.now()} reads the host zone, and on a UTC
 * container 00:00-05:29 IST is still yesterday. Instants are stored and compared in UTC regardless. */
public final class PlatformTime {

    // A region rather than +05:30, so a future DST rule would apply without a code change.
    public static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    public static final int MAX_WINDOW_DAYS = 3660;

    private PlatformTime() {
    }

    /** Start of a "last N days" filter: IST midnight N-1 days back, so 1 is today, not the last 24 hours. */
    public static Instant windowStart(int days) {
        return windowStart(days, Instant.now());
    }

    /** A list's optional {@code ?days=}: null is unfiltered; the cap makes a fuzzed huge value a 400, not a 500. */
    public static Instant sinceOrNull(Integer days) {
        if (days == null || days < 1) return null;
        if (days > MAX_WINDOW_DAYS) throw new BadRequestException("days must be at most " + MAX_WINDOW_DAYS);
        return windowStart(days);
    }

    static Instant windowStart(int days, Instant now) {
        return LocalDate.ofInstant(now, IST).minusDays(days - 1L).atStartOfDay(IST).toInstant();
    }
}
