package com.draazy.api.support;

import java.util.UUID;

/** A photo URL in the dev store's legacy {@code photos/<owner id>/<uuid>} shape, accepted as that owner's upload. */
public final class UploadedPhotos {

    private static final String PREFIX = "/api/dev/storage/public/photos/";

    private UploadedPhotos() {
    }

    public static String of(UUID owner) {
        return PREFIX + owner + "/" + UUID.randomUUID();
    }
}
