package com.draazy.api.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class RegexOracle {
    private RegexOracle() {
    }

    public static List<String> corpus(String alphabet, int maxLength, int count, long seed) {
        Random random = new Random(seed);
        List<String> out = new ArrayList<>(count + 1);
        out.add("");
        for (int i = 0; i < count; i++) {
            int length = random.nextInt(maxLength + 1);
            StringBuilder sb = new StringBuilder(length);
            for (int j = 0; j < length; j++) {
                sb.append(alphabet.charAt(random.nextInt(alphabet.length())));
            }
            out.add(sb.toString());
        }
        return out;
    }

    public static Pattern field(Class<?> owner, String name) {
        try {
            var field = owner.getDeclaredField(name);
            field.setAccessible(true);
            return (Pattern) field.get(null);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }

    public static void assertAgree(Pattern expected, Pattern actual, Iterable<String> inputs) {
        for (String input : inputs) {
            assertThat(signature(actual, input)).as("input %s", describe(input)).isEqualTo(signature(expected, input));
        }
    }

    public static void assertMatchesAgree(Pattern expected, Pattern actual, Iterable<String> inputs) {
        for (String input : inputs) {
            assertThat(actual.matcher(input).matches()).as("input %s", describe(input))
                    .isEqualTo(expected.matcher(input).matches());
        }
    }

    public static void assertQuick(Runnable work) {
        assertTimeoutPreemptively(Duration.ofSeconds(1), work::run);
    }

    private static String signature(Pattern pattern, String input) {
        StringBuilder sb = new StringBuilder();
        sb.append(pattern.matcher(input).matches()).append('|');
        Matcher m = pattern.matcher(input);
        while (m.find()) {
            sb.append(m.start()).append('-').append(m.end());
            for (int g = 1; g <= m.groupCount(); g++) {
                sb.append(',').append(m.group(g));
            }
            sb.append(';');
        }
        return sb.toString();
    }

    private static String describe(String input) {
        return input.length() > 80 ? input.substring(0, 80) + "..." : input.replace("\n", "\\n").replace("\r", "\\r");
    }
}
