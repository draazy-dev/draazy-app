package com.draazy.api.support;

import java.util.UUID;

public final class UploadedPhotos {
    private static final String PREFIX = "/api/dev/storage/public/photos/";

    private UploadedPhotos() {
    }

    public static String of(UUID owner) {
        return PREFIX + owner + "/" + UUID.randomUUID();
    }
}
