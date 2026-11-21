package com.draazy.api.catalog.society;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.RegexOracle;
import java.util.List;
import java.util.Locale;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("SocietyMintService.slugify — split trim agrees with the original alternation")
class SocietyMintServiceSonarRegexTest {
    private static String original(String name, String locality) {
        String joined = (SocietySpecs.trimmed(name) == null ? "" : name.trim())
                + (SocietySpecs.trimmed(locality) == null ? "" : " " + locality.trim());
        return joined.toLowerCase(Locale.ROOT).trim()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
    }

    @Test
    void agreesWithTheOriginalOnRandomAndEdgeInputs() {
        List<String> names = RegexOracle.corpus("aB9 -_.,/\n\t\u00e9", 12, 300, 81L);
        for (String name : names) {
            for (String locality : names.subList(0, 120)) {
                assertThat(SocietyMintService.slugify(name, locality)).as("[%s] [%s]", name, locality)
                        .isEqualTo(original(name, locality));
            }
        }
        assertThat(SocietyMintService.slugify(null, null)).isEmpty();
        assertThat(SocietyMintService.slugify("  Kumar Park ", " Baner ")).isEqualTo("kumar-park-baner");
        assertThat(SocietyMintService.slugify("---", "---")).isEmpty();
    }

    @Test
    void longRunsOfSeparatorsStayLinear() {
        RegexOracle.assertQuick(() -> {
            assertThat(SocietyMintService.slugify("-".repeat(200_000), null)).isEmpty();
            assertThat(SocietyMintService.slugify("a" + "-".repeat(200_000), "!".repeat(1000))).isEqualTo("a");
        });
    }
}
