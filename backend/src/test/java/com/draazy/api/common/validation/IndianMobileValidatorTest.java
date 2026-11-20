package com.draazy.api.common.validation;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("IndianMobileValidator — tolerant input, strict stored shape (Q1)")
class IndianMobileValidatorTest {
    private final IndianMobileValidator validator = new IndianMobileValidator();

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
        "9821000123",
        "+91 98210 00123",
        "09821000123",
        "00919821000123",
        "982-100-0123",
    })
    @DisplayName("accepts null and anything that canonicalises to a valid ten-digit mobile")
    void accepts(String value) {
        assertThat(validator.isValid(value, null)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {
        "1234567890",
        "2012345678",
        "5999999999",
        "98765",
        "987654321012345",
        "12345678901234",
        "not-a-number",
    })
    @DisplayName("rejects text that is not, or does not reduce to, a 6-9-leading ten-digit mobile")
    void rejects(String value) {
        assertThat(validator.isValid(value, null)).isFalse();
    }
}
