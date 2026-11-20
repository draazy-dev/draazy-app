package com.draazy.api.common.web;

import java.util.Optional;
import java.util.UUID;

public final class Ids {
    private Ids() {
    }

    public static Optional<UUID> parseUuid(String token) {
        try {
            return Optional.of(UUID.fromString(token));
        } catch (IllegalArgumentException | NullPointerException notUuid) {
            return Optional.empty();
        }
    }
}
