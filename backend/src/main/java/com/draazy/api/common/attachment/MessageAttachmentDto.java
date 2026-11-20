package com.draazy.api.common.attachment;

import java.time.Instant;

public record MessageAttachmentDto(
        String id,
        String fileName,
        String contentType,
        long sizeBytes,
        String url,
        Instant uploadedAt) {
}
