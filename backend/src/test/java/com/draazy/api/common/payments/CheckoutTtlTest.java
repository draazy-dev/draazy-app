package com.draazy.api.common.payments;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("D169 — one TTL feeds both the sweep's look-back and the gateway's look-forward")
class CheckoutTtlTest {

    private static final Instant NOW = Instant.parse("2026-03-14T09:30:00Z");

    @Test
    @DisplayName("the look-back and the look-forward are the same span, mirrored about now")
    void bothWindowsAreTheSameSpan() {
        CheckoutTtl ttl = new CheckoutTtl(45);

        assertThat(Duration.between(ttl.cutoffFrom(NOW), NOW)).isEqualTo(ttl.duration());
        assertThat(Duration.between(NOW, ttl.expiryFrom(NOW))).isEqualTo(ttl.duration());
        assertThat(Duration.between(ttl.cutoffFrom(NOW), ttl.expiryFrom(NOW)))
                .isEqualTo(ttl.duration().multipliedBy(2));
    }

    @Test
    @DisplayName("an unconfigured deployment gets forty-five minutes")
    void theDefaultIsDeclaredInCode() {
        assertThat(CheckoutTtl.DEFAULT_MINUTES).isEqualTo(45);
        assertThat(new CheckoutTtl(CheckoutTtl.DEFAULT_MINUTES).duration())
                .isEqualTo(Duration.ofMinutes(45));
    }

    @Test
    @DisplayName("a longer TTL is honoured as configured")
    void aLongerTtlIsTakenAtFaceValue() {
        assertThat(new CheckoutTtl(120).duration()).isEqualTo(Duration.ofMinutes(120));
    }

    @Test
    @DisplayName("a TTL below the gateway minimum is clamped, not silently unmirrored")
    void aTooShortTtlIsClamped() {
        assertThat(new CheckoutTtl(5).duration()).isEqualTo(CheckoutTtl.GATEWAY_MINIMUM);
        assertThat(new CheckoutTtl(0).duration()).isEqualTo(CheckoutTtl.GATEWAY_MINIMUM);
    }

    // Clamping inside the gateway instead would leave the sweep on the raw value and the windows apart.
    @Test
    @DisplayName("a clamped TTL still leaves both windows in step")
    void clampingKeepsBothWindowsInStep() {
        CheckoutTtl ttl = new CheckoutTtl(1);

        assertThat(Duration.between(ttl.cutoffFrom(NOW), NOW))
                .isEqualTo(Duration.between(NOW, ttl.expiryFrom(NOW)));
    }
}
