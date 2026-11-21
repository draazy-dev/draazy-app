package com.draazy.api.engagement.demand;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("DemandSignalCreate localitySlug pattern — possessive form agrees with the original")
class DemandSignalCreateSonarRegexTest {
    private static final java.util.regex.Pattern ORIGINAL =
            java.util.regex.Pattern.compile("\\s*|[a-z0-9]+(?:-[a-z0-9]+)*");
    private static final java.util.regex.Pattern ACTUAL = java.util.regex.Pattern.compile(slugRegexp());

    private static String slugRegexp() {
        try {
            return DemandSignalCreate.class.getDeclaredField("localitySlug").getAnnotation(Pattern.class).regexp();
        } catch (NoSuchFieldException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        RegexOracle.assertAgree(ORIGINAL, ACTUAL, RegexOracle.corpus("aZ09-_ \n\t", 12, 30000, 31L));
        RegexOracle.assertAgree(ORIGINAL, ACTUAL,
                List.of("", "   ", "baner", "wakad-road", "-a", "a-", "a--b", "a b", "A", "a\n", "\n"));
    }

    @Test
    void longInputsNeitherBacktrackNorOverflowTheStack() {
        String longSlug = "a" + "-b".repeat(100_000);
        RegexOracle.assertQuick(() -> {
            assertThat(ACTUAL.matcher(longSlug).matches()).isTrue();
            assertThat(ACTUAL.matcher(longSlug + "-").matches()).isFalse();
            assertThat(ACTUAL.matcher("a".repeat(200_000) + "!").matches()).isFalse();
        });
    }
}
