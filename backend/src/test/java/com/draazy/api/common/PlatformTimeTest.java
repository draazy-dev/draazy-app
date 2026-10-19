package com.draazy.api.common;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.draazy.api.common.error.BadRequestException;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class PlatformTimeTest {

    private static final Instant IST_AFTERNOON = Instant.parse("2026-10-19T08:50:00Z");
    private static final Instant IST_JUST_AFTER_MIDNIGHT = Instant.parse("2026-10-18T18:31:00Z");

    @Test
    @DisplayName("a one-day window starts at IST midnight, not 24 hours ago")
    void todayIsTheIstCalendarDay() {
        assertThat(PlatformTime.windowStart(1, IST_AFTERNOON)).isEqualTo(Instant.parse("2026-10-18T18:30:00Z"));
        assertThat(PlatformTime.windowStart(1, IST_JUST_AFTER_MIDNIGHT))
                .isEqualTo(Instant.parse("2026-10-18T18:30:00Z"));
    }

    @Test
    @DisplayName("an N-day window is today plus the N-1 IST days before it")
    void longerWindowsCountCalendarDays() {
        assertThat(PlatformTime.windowStart(7, IST_AFTERNOON)).isEqualTo(Instant.parse("2026-10-12T18:30:00Z"));
        assertThat(PlatformTime.windowStart(30, IST_AFTERNOON)).isEqualTo(Instant.parse("2026-09-19T18:30:00Z"));
    }

    @Test
    @DisplayName("an absent or non-positive days means no filter, and an absurd one is a 400 rather than a 500")
    void sinceOrNullBoundsTheParam() {
        assertThat(PlatformTime.sinceOrNull(null)).isNull();
        assertThat(PlatformTime.sinceOrNull(0)).isNull();
        assertThat(PlatformTime.sinceOrNull(1)).isEqualTo(PlatformTime.windowStart(1));
        assertThat(PlatformTime.sinceOrNull(PlatformTime.MAX_WINDOW_DAYS)).isNotNull();
        assertThatThrownBy(() -> PlatformTime.sinceOrNull(Integer.MAX_VALUE)).isInstanceOf(BadRequestException.class);
    }
}
