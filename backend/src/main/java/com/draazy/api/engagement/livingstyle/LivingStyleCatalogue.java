package com.draazy.api.engagement.livingstyle;

import com.draazy.api.common.error.BadRequestException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class LivingStyleCatalogue {
    private LivingStyleCatalogue() {
    }

    public static final List<String> KEYS = List.of("tidy", "food", "sleep", "wfh", "guests", "visitors",
            "smoking", "drinks", "pets", "bills", "family", "quiet");

    public static final List<String> FILTER_KEYS = List.of("food", "smoking", "pets", "drinks", "visitors", "sleep");

    public static final int MAX = 2;

    public static final int MIN_COMMON = 3;

    public record Score(Integer match, int common) {
    }

    public record Shared(String key, int answer) {
    }

    private static final List<String> SHARED_PRIORITY = List.of("sleep", "food", "smoking", "pets", "drinks",
            "tidy", "wfh", "guests", "visitors", "bills", "family", "quiet");

    public static final int SHARED_TOP = 2;

    public static List<Shared> shared(Map<String, Integer> mine, Map<String, Integer> theirs) {
        return SHARED_PRIORITY.stream()
                .filter(key -> mine.get(key) != null && mine.get(key).equals(theirs.get(key)))
                .limit(SHARED_TOP)
                .map(key -> new Shared(key, mine.get(key)))
                .toList();
    }

    public static Score score(Map<String, Integer> mine, Map<String, Integer> theirs) {
        int common = 0;
        int points = 0;
        for (String key : KEYS) {
            Integer a = mine.get(key);
            Integer b = theirs.get(key);
            if (a != null && b != null) {
                common++;
                points += MAX - Math.abs(a - b);
            }
        }
        if (common < MIN_COMMON) {
            return new Score(null, common);
        }
        return new Score((int) Math.round(100.0 * points / (MAX * common)), common);
    }

    public static Map<String, Integer> validated(Map<String, Object> raw) {
        if (raw == null) {
            throw new BadRequestException("answers is required.");
        }
        Map<String, Integer> clean = new LinkedHashMap<>();
        for (String key : KEYS) {
            if (raw.containsKey(key)) {
                clean.put(key, answer(key, raw.get(key)));
            }
        }
        if (clean.size() != raw.size()) {
            String unknown = raw.keySet().stream().filter(k -> !KEYS.contains(k)).findFirst().orElse("");
            throw new BadRequestException("Unknown living-style question: '" + unknown
                    + "'. Expected one of " + String.join(", ", KEYS) + ".");
        }
        return clean;
    }

    private static int answer(String key, Object value) {
        if (value instanceof Integer n && n >= 0 && n <= MAX) {
            return n;
        }
        throw new BadRequestException("Answer for '" + key + "' must be a whole number from 0 to " + MAX + ".");
    }

    public static Map<String, Integer> ordered(Map<String, Integer> answers) {
        Map<String, Integer> out = new LinkedHashMap<>();
        for (String key : KEYS) {
            if (answers.containsKey(key)) {
                out.put(key, answers.get(key));
            }
        }
        return out;
    }
}
