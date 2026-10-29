package com.draazy.api.catalog.property;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class FreshnessTest {
    private static final Instant NOW = Instant.parse("2026-03-01T12:00:00Z");

    @Test
    @DisplayName("the SQL cutoff is unconfirmed, and one second later is not")
    void cutoffAgreesWithClassifier() {
        Instant cutoff = Freshness.unconfirmedBefore(NOW);

        assertThat(Freshness.of(cutoff, null, NOW).unconfirmed())
                .as("a listing confirmed exactly at the cutoff is one the desk should chase")
                .isTrue();
        assertThat(Freshness.of(cutoff.plusSeconds(1), null, NOW).unconfirmed())
                .as("one second inside the boundary is still AGING — an automated nudge, not a call")
                .isFalse();
    }

    @Test
    @DisplayName("the cutoff sits a day past AGING_DAYS, because of() floors the duration")
    void cutoffIsADayPastTheNominalThreshold() {
        assertThat(Duration.between(Freshness.unconfirmedBefore(NOW), NOW))
                .isEqualTo(Duration.ofDays(Freshness.AGING_DAYS + 1L));

        Instant exactlyAgingDays = NOW.minus(Duration.ofDays(Freshness.AGING_DAYS));
        assertThat(Freshness.of(exactlyAgingDays, null, NOW)).isEqualTo(Freshness.AGING);
    }

    @Test
    @DisplayName("unconfirmed() is STALE or DORMANT — never AGING, which a cron job already handles")
    void unconfirmedExcludesAging() {
        assertThat(Freshness.ACTIVE.unconfirmed()).isFalse();
        assertThat(Freshness.AGING.unconfirmed()).isFalse();
        assertThat(Freshness.STALE.unconfirmed()).isTrue();
        assertThat(Freshness.DORMANT.unconfirmed()).isTrue();
    }

    @Test
    @DisplayName("a listing nobody ever confirmed falls back to when it was posted")
    void fallsBackToCreatedAt() {
        Instant longAgo = NOW.minus(Duration.ofDays(90));

        assertThat(Freshness.of(null, longAgo, NOW).unconfirmed())
                .as("never confirmed and posted three months ago is exactly who the desk chases")
                .isTrue();
        assertThat(Freshness.of(null, NOW.minus(Duration.ofDays(1)), NOW).unconfirmed())
                .as("posting is itself an assertion of availability, so a fresh post is not stale")
                .isFalse();
    }
}
