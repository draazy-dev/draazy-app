package com.draazy.api.engagement.livingstyle;

import java.time.Instant;
import java.util.Map;

/** {@code updatedAt} is null when the caller has no answers. */
public record LivingStyleDto(Map<String, Integer> answers, Instant updatedAt) {

    static final LivingStyleDto EMPTY = new LivingStyleDto(Map.of(), null);

    static LivingStyleDto of(UserLivingStyle row) {
        return new LivingStyleDto(LivingStyleCatalogue.ordered(row.getAnswers()), row.getUpdatedAt());
    }
}
