package com.draazy.api.admin;

import java.time.Instant;
import java.util.UUID;

public record AdminHelpFeedbackComment(
        UUID id,
        String slug,
        String lang,
        boolean helpful,
        String comment,
        Instant createdAt) {
}
