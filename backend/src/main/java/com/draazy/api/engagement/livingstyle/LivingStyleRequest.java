package com.draazy.api.engagement.livingstyle;

import java.util.Map;

/** Values stay {@code Object} so {@code 1.5} or {@code "1"} reach validation instead of being coerced. */
public record LivingStyleRequest(Map<String, Object> answers) {
}
