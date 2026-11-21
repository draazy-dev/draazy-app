package com.draazy.api.catalog.listing;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("NoContactDetails EMAIL — peeled possessive local part agrees with the original")
class NoContactDetailsSonarRegexTest {
    private static final String LOCAL = "[\\p{L}0-9._%+-]";
    private static final Pattern ACTUAL = RegexOracle.field(NoContactDetails.Validator.class, "EMAIL");
    private static final Pattern ORIGINAL = Pattern.compile(
            ACTUAL.pattern().replace(LOCAL + LOCAL + "*+", LOCAL + "++"), ACTUAL.flags());

    @Test
    void oracleDiffersFromTheProductionSource() {
        assertThat(ORIGINAL.pattern()).isNotEqualTo(ACTUAL.pattern()).contains("++(?:@");
    }

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        RegexOracle.assertAgree(ORIGINAL, ACTUAL, RegexOracle.corpus("aT1.@ _-()[]dotgmail\u00e9\n", 16, 60000, 61L));
        RegexOracle.assertAgree(ORIGINAL, ACTUAL, List.of("mail me at john@gmail.com", "john (at) gmail dot com",
                "john at the rate yahoo.com", "john [at] gmail.com", "john @ gmail", "john@", "@gmail.com",
                "a.b+c@sub.example.co.in", "x@y", "JOHN@GMAIL.COM", "caf\u00e9@gmail.com", "-a@b.cc", "a-@b.cc"));
    }

    @Test
    void longInputsWithoutAnAddressDoNotBacktrack() {
        RegexOracle.assertQuick(() -> {
            assertThat(ACTUAL.matcher("a".repeat(100_000)).find()).isFalse();
            assertThat(ACTUAL.matcher("a.".repeat(50_000)).find()).isFalse();
            assertThat(ACTUAL.matcher("a".repeat(100_000) + "@gmail.com").find()).isTrue();
        });
    }
}
