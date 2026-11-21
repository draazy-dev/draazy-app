package com.draazy.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("AdminSettingsService OFFICER_EMAIL — linear form agrees with the original")
class AdminSettingsServiceSonarRegexTest {
    private static final Pattern ORIGINAL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");
    private static final Pattern ACTUAL = RegexOracle.field(AdminSettingsService.class, "OFFICER_EMAIL");

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        RegexOracle.assertMatchesAgree(ORIGINAL, ACTUAL, RegexOracle.corpus("ab@.. \n-", 12, 60000, 51L));
        RegexOracle.assertMatchesAgree(ORIGINAL, ACTUAL, List.of("a@b.c", "a@.b", "a@b.", "a@..", "a@...", "a@b..c", "@b.c",
                "a@b.c\n", "a b@c.d", "a@b@c.d", "officer@draazy.in", "a@bc", "a@.", "é@ü.ö"));
        assertThat(ACTUAL.matcher("officer@draazy.in").matches()).isTrue();
    }

    @Test
    void longInputsDoNotBacktrack() {
        String user = "a".repeat(100_000);
        RegexOracle.assertQuick(() -> {
            assertThat(ACTUAL.matcher(user + "@" + user + "." + user).matches()).isTrue();
            assertThat(ACTUAL.matcher(user + "@" + user).matches()).isFalse();
            assertThat(ACTUAL.matcher(user + "@" + ".".repeat(100_000)).matches()).isTrue();
            assertThat(ACTUAL.matcher(user + "@" + user + "!").matches()).isFalse();
        });
    }
}
