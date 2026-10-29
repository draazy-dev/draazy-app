package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Shared formats — no inline re-spelling (tech-debt D25)")
class SharedFormatsTest {
    private static final Path MAIN = Path.of("src", "main", "java").toAbsolutePath();

    private static final String INLINE_MOBILE = "\"^[6-9][0-9]{9}$\"";

    private static final String CANONICAL_HOME = "Formats.java";

    @Test
    @DisplayName("the Indian mobile pattern appears as a literal in exactly one file")
    void mobilePatternIsNotRespelled() {
        List<String> offenders = javaFiles()
                .filter(p -> !p.getFileName().toString().equals(CANONICAL_HOME))
                .filter(p -> read(p).contains(INLINE_MOBILE))
                .map(p -> MAIN.relativize(p).toString().replace('\\', '/'))
                .sorted()
                .toList();

        assertThat(offenders)
                .as("""
                        These files spell the Indian mobile pattern inline. For a request field use \
                        @IndianMobile (it tolerates spacing and a +91 prefix, then gates the \
                        normalised value against Formats.MOBILE); Formats.MOBILE stays the one \
                        storage pattern. Either way the rule — and its 422 message — lives in one \
                        place, so a caller integrating against the platform never sees one rule \
                        described three ways depending on which endpoint rejected them.""")
                .isEmpty();
    }

    @Test
    @DisplayName("the canonical home holds the pattern it claims to own")
    void formatsActuallyDeclaresIt() {
        Path formats = MAIN.resolve(
                Path.of("com", "draazy", "api", "common", "validation", CANONICAL_HOME));

        assertThat(formats).exists();
        assertThat(read(formats)).contains(INLINE_MOBILE);
    }

    private static Stream<Path> javaFiles() {
        try (Stream<Path> walk = Files.walk(MAIN)) {
            return walk.filter(p -> p.getFileName().toString().endsWith(".java")).toList().stream();
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot walk " + MAIN, e);
        }
    }

    private static String read(Path file) {
        try {
            return Files.readString(file, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Cannot read " + file, e);
        }
    }
}
