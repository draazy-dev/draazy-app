package com.draazy.api.engagement.clienterror;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("ClientErrorService POSITIONS — possessive form agrees with the original")
class ClientErrorServiceSonarRegexTest {
    private static final Pattern ORIGINAL = Pattern.compile("(?::\\d+)+");
    private static final Pattern ACTUAL = RegexOracle.field(ClientErrorService.class, "POSITIONS");

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        RegexOracle.assertAgree(ORIGINAL, ACTUAL, RegexOracle.corpus(":12ab. \n", 14, 30000, 21L));
        RegexOracle.assertAgree(ORIGINAL, ACTUAL, List.of("app.js:10:20", "app.js:10:", "::1", "a:1:2:3b", ":", "x"));
        assertThat(ACTUAL.matcher("app.js:10:20").replaceAll("")).isEqualTo("app.js");
    }

    @Test
    void longInputsNeitherBacktrackNorOverflowTheStack() {
        String positions = ":1".repeat(200_000);
        RegexOracle.assertQuick(() -> {
            assertThat(ACTUAL.matcher("f.js" + positions).replaceAll("")).isEqualTo("f.js");
            assertThat(ACTUAL.matcher(":".repeat(200_000)).replaceAll("")).hasSize(200_000);
        });
    }
}
