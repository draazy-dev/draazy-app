package com.draazy.api.catalog.locality;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("LocalityPlaceService.slugify — split trim agrees with the original alternation")
class LocalityPlaceServiceSonarRegexTest {
    private static String original(String name) {
        return name.toLowerCase(Locale.ROOT).trim()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
    }

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        for (String input : RegexOracle.corpus("aB9 -_.,/\n\t\u00e9", 14, 40000, 71L)) {
            assertThat(LocalityPlaceService.slugify(input)).as("input [%s]", input).isEqualTo(original(input));
        }
        for (String input : List.of("Baner", "  Wakad Road ", "---", "-", "a-", "-a", "--a--b--", "Hinjewadi Phase-1!",
                "!!!", "")) {
            assertThat(LocalityPlaceService.slugify(input)).isEqualTo(original(input));
        }
        assertThat(LocalityPlaceService.slugify("  Wakad  Road! ")).isEqualTo("wakad-road");
    }

    @Test
    void longRunsOfSeparatorsStayLinear() {
        RegexOracle.assertQuick(() -> {
            assertThat(LocalityPlaceService.slugify("-".repeat(200_000))).isEmpty();
            assertThat(LocalityPlaceService.slugify("a" + "-".repeat(200_000))).isEqualTo("a");
            assertThat(LocalityPlaceService.slugify("-".repeat(200_000) + "a" + "!".repeat(200_000))).isEqualTo("a");
        });
    }
}
