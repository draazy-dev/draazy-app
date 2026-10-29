package com.draazy.api.documents.vault;

import java.time.Instant;

public record DocumentDto(
        String id,
        String propertyId,
        String category,
        String fileName,
        String url,
        Long sizeBytes,
        String mimeType,
        Instant uploadedAt) {
}
