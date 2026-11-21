package com.draazy.api.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("JobRunScheduler QUALIFIED_METHOD — possessive form agrees with the original")
class JobRunSchedulerSonarRegexTest {
    private static final Pattern ORIGINAL = Pattern.compile("[\\w$]+(?:\\.[\\w$]+)+");
    private static final Pattern ACTUAL = RegexOracle.field(JobRunScheduler.class, "QUALIFIED_METHOD");

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        RegexOracle.assertAgree(ORIGINAL, ACTUAL, RegexOracle.corpus("ab$_.1-: \n", 12, 30000, 11L));
        RegexOracle.assertAgree(ORIGINAL, ACTUAL,
                java.util.List.of("a.b", "a.", ".a", "a..b", "A.b$c.d_e", "lambda$run$0.x", "a.b\n", "é.b"));
    }

    @Test
    void longInputsNeitherBacktrackNorOverflowTheStack() {
        String qualified = "a" + ".b".repeat(200_000);
        String unterminated = "a" + ".b".repeat(200_000) + ".";
        RegexOracle.assertQuick(() -> {
            assertThat(ACTUAL.matcher(qualified).matches()).isTrue();
            assertThat(ACTUAL.matcher(unterminated).matches()).isFalse();
            assertThat(ACTUAL.matcher("a".repeat(200_000) + "!").matches()).isFalse();
        });
    }
}
