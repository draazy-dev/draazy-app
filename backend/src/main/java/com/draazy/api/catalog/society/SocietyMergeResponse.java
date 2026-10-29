package com.draazy.api.catalog.society;

import java.time.Instant;

public record SocietyMergeResponse(
        String slug,
        String name,
        String intoSlug,
        String intoName,
        Instant mergedAt) {
}
