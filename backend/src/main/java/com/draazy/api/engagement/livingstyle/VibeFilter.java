package com.draazy.api.engagement.livingstyle;

import com.draazy.api.common.error.BadRequestException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class VibeFilter {
    private static final Pattern TOKEN = Pattern.compile("([a-z]+):([0-" + LivingStyleCatalogue.MAX + "])");

    private VibeFilter() {
    }

    public static Map<String, List<Integer>> parse(Collection<String> tokens) {
        return collect(tokens, true);
    }

    public static Map<String, List<Integer>> parseLenient(Collection<?> tokens) {
        return collect(tokens == null ? null : tokens.stream().map(String::valueOf).toList(), false);
    }

    private static Map<String, List<Integer>> collect(Collection<String> tokens, boolean strict) {
        Map<String, TreeSet<Integer>> byKey = new LinkedHashMap<>();
        for (String raw : tokens == null ? List.<String>of() : tokens) {
            String token = raw == null ? "" : raw.strip();
            if (token.isEmpty()) {
                continue;
            }
            Matcher m = TOKEN.matcher(token);
            if (!m.matches() || !LivingStyleCatalogue.FILTER_KEYS.contains(m.group(1))) {
                if (strict) {
                    throw new BadRequestException("Invalid vibe filter '" + token + "'. Expected key:answer with key one of "
                            + String.join(", ", LivingStyleCatalogue.FILTER_KEYS) + " and answer 0 to "
                            + LivingStyleCatalogue.MAX + ".");
                }
                continue;
            }
            byKey.computeIfAbsent(m.group(1), k -> new TreeSet<>()).add(Integer.parseInt(m.group(2)));
        }
        Map<String, List<Integer>> ordered = new LinkedHashMap<>();
        for (String key : LivingStyleCatalogue.FILTER_KEYS) {
            if (byKey.containsKey(key)) {
                ordered.put(key, List.copyOf(byKey.get(key)));
            }
        }
        return ordered;
    }

    public static String sql(String authorColumn, Map<String, List<Integer>> wanted,
            Map<String, Integer> viewerAnswers, Map<String, Object> params) {
        if (viewerAnswers.size() < LivingStyleCatalogue.MIN_COMMON) {
            return "";
        }
        List<String> terms = new ArrayList<>();
        wanted.forEach((key, answers) -> {
            if (!viewerAnswers.containsKey(key)) {
                return;
            }
            List<String> binds = new ArrayList<>();
            for (int i = 0; i < answers.size(); i++) {
                String name = "vibe_" + key + "_" + i;
                binds.add(":" + name);
                params.put(name, answers.get(i));
            }
            terms.add("cast(vs.answers ->> '" + key + "' as integer) in (" + String.join(", ", binds) + ")");
        });
        if (terms.isEmpty()) {
            return "";
        }
        return " and exists (select 1 from user_living_style vs where vs.user_id = " + authorColumn
                + " and " + String.join(" and ", terms) + ")";
    }
}
