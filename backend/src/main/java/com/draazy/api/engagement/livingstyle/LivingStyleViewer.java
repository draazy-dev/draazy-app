package com.draazy.api.engagement.livingstyle;

import java.util.Map;
import java.util.UUID;

public record LivingStyleViewer(UUID userId, Map<String, Integer> answers) {
    public static final LivingStyleViewer NONE = new LivingStyleViewer(null, Map.of());

    public LivingStyleViewer {
        answers = answers == null ? Map.of() : Map.copyOf(answers);
    }

    public boolean scorable() {
        return answers.size() >= LivingStyleCatalogue.MIN_COMMON;
    }
}
