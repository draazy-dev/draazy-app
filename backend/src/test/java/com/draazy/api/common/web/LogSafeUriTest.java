package com.draazy.api.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class LogSafeUriTest {
    private static final String TOKEN = "8mQ2r-3fV_kZ1pW7sT0xY9aB4cD6eF8gH2iJ4kL6mN8";

    @Test
    void masksTheShareTokenAndNothingElse() {
        assertThat(LogSafeUri.redact("/api/documents/shared?token=" + TOKEN))
                .isEqualTo("/api/documents/shared?token=REDACTED")
                .doesNotContain(TOKEN);
    }

    @Test
    void keepsTheRestOfTheQueryReadable() {
        assertThat(LogSafeUri.redact("/api/documents/shared?page=2&token=" + TOKEN + "&size=20"))
                .isEqualTo("/api/documents/shared?page=2&token=REDACTED&size=20");
    }

    @Test
    void masksEveryOccurrence() {
        assertThat(LogSafeUri.redact("/x?token=" + TOKEN + "&token=" + TOKEN))
                .isEqualTo("/x?token=REDACTED&token=REDACTED");
    }

    @Test
    void matchesTheParameterNameCaseInsensitively() {
        assertThat(LogSafeUri.redact("/x?Token=" + TOKEN)).isEqualTo("/x?Token=REDACTED");
        assertThat(LogSafeUri.redact("/x?ACCESS_TOKEN=" + TOKEN))
                .isEqualTo("/x?ACCESS_TOKEN=REDACTED");
    }

    @Test
    void leavesAUriWithNothingToHideExactlyAsItWas() {
        assertThat(LogSafeUri.redact("/api/properties")).isEqualTo("/api/properties");
        assertThat(LogSafeUri.redact("/api/properties?city=pune"))
                .isEqualTo("/api/properties?city=pune");
        assertThat(LogSafeUri.redact("/api/properties?")).isEqualTo("/api/properties?");
        assertThat(LogSafeUri.redact(null)).isNull();
    }

    @Test
    void doesNotInventAValueForAValuelessParameter() {
        assertThat(LogSafeUri.redact("/x?token")).isEqualTo("/x?token");
        assertThat(LogSafeUri.redact("/x?token=")).isEqualTo("/x?token=REDACTED");
    }

    @Test
    void doesNotMatchOnASubstringOfAnInnocentParameter() {
        assertThat(LogSafeUri.redact("/x?tokenCount=3")).isEqualTo("/x?tokenCount=3");
        assertThat(LogSafeUri.redact("/x?mytoken=" + TOKEN)).isEqualTo("/x?mytoken=" + TOKEN);
    }
}
