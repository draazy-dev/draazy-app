package com.draazy.api.engagement.livingstyle;

import java.util.Map;
import java.util.UUID;

/** The signed-in viewer's answers for one feed request; {@link #NONE} for guests. */
public record LivingStyleViewer(UUID userId, Map<String, Integer> answers) {

    public static final LivingStyleViewer NONE = new LivingStyleViewer(null, Map.of());

    public LivingStyleViewer {
        answers = answers == null ? Map.of() : Map.copyOf(answers);
    }

    /** Fewer than {@link LivingStyleCatalogue#MIN_COMMON} answers can never score against anyone. */
    public boolean scorable() {
        return answers.size() >= LivingStyleCatalogue.MIN_COMMON;
    }
}
