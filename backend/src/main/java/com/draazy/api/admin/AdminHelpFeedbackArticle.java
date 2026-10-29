package com.draazy.api.admin;

import java.time.Instant;

public record AdminHelpFeedbackArticle(
        String slug,
        String lang,
        long helpful,
        long notHelpful,
        long comments,
        Instant lastAt) {
}
