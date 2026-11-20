package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class JwtPropertiesTest {
    private static final String SECRET = "a-thirty-two-byte-secret-for-hs384-signing";

    @Test
    void theShippedDefaultsAreAccepted() {
        assertThatCode(() -> new JwtProperties(
                SECRET, Duration.ofMinutes(15), Duration.ofDays(30), Duration.ofSeconds(15)))
                .doesNotThrowAnyException();
    }

    @Test
    void aGraceWindowOfZeroIsAllowed() {
        assertThatCode(() -> new JwtProperties(
                SECRET, Duration.ofMinutes(15), Duration.ofDays(30), Duration.ZERO))
                .doesNotThrowAnyException();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("rejectedConfigs")
    void aMisconfiguredLifetimeIsRejected(String label, Duration access, Duration refresh,
            Duration grace, String[] messageParts) {
        assertThatThrownBy(() -> new JwtProperties(SECRET, access, refresh, grace))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContainingAll(messageParts);
    }

    static Stream<Arguments> rejectedConfigs() {
        Duration access = Duration.ofMinutes(15);
        Duration refresh = Duration.ofDays(30);
        Duration grace = Duration.ofSeconds(15);
        return Stream.of(
                Arguments.of("a grace window measured in days turns reuse-detection off without "
                        + "appearing to", access, refresh, Duration.ofDays(30),
                        new String[] {"refresh-grace", "forgives every replay"}),
                Arguments.of("a negative grace window", access, refresh, Duration.ofSeconds(-1),
                        new String[] {"must not be negative"}),
                Arguments.of("a zero access-ttl", Duration.ZERO, refresh, grace,
                        new String[] {"access-ttl must be positive"}),
                Arguments.of("a negative refresh-ttl", access, Duration.ofMinutes(-1), grace,
                        new String[] {"refresh-ttl must be positive"}),
                Arguments.of("an access token may not outlive its refresh token", Duration.ofDays(2),
                        Duration.ofDays(1), grace, new String[] {"leaves nothing to rotate"}));
    }
}
