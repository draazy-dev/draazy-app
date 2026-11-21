package com.draazy.api.services.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("IdentityNoteRedaction digit-run pattern — possessive form agrees with the original")
class IdentityNoteRedactionSonarRegexTest {
    private static final Pattern ORIGINAL = Pattern.compile("(?i)(?:\\d[\\s-]?){8,}");

    @SuppressWarnings("unchecked")
    private static Pattern actual() throws ReflectiveOperationException {
        var field = IdentityNoteRedaction.class.getDeclaredField("SENSITIVE_NUMBERS");
        field.setAccessible(true);
        return ((List<Pattern>) field.get(null)).get(0);
    }

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() throws Exception {
        Pattern actual = actual();
        RegexOracle.assertAgree(ORIGINAL, actual, RegexOracle.corpus("1234 -a\t\n", 24, 40000, 41L));
        RegexOracle.assertAgree(ORIGINAL, actual, List.of("1234 5678 9012", "12345678 ", "1234567", "1-2-3-4-5-6-7-8-",
                "12 34 56 78 x", "ab 12345678-", "1234567 8", "12345678\n"));
        assertThat(IdentityNoteRedaction.redact("aadhaar 1234 5678 9012 ok")).doesNotContain("1234");
    }

    @Test
    void longInputsNeitherBacktrackNorOverflowTheStack() throws Exception {
        Pattern actual = actual();
        String digits = "1 ".repeat(200_000);
        RegexOracle.assertQuick(() -> {
            assertThat(actual.matcher(digits).replaceAll("#")).isEqualTo("#");
            assertThat(actual.matcher("1".repeat(7) + "x").find()).isFalse();
            assertThat(actual.matcher("1 ".repeat(7) + "x" + digits).replaceAll("#")).isEqualTo("1 1 1 1 1 1 1 x#");
        });
    }
}
