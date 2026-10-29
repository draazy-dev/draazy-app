package com.draazy.api.documents.vault;

import java.time.Instant;

public record DocumentSummary(
        String id,
        String category,
        String fileName,
        Long sizeBytes,
        String mimeType,
        Instant uploadedAt) {
}
