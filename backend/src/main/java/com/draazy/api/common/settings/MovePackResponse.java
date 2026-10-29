package com.draazy.api.common.settings;

import java.util.Map;

public record MovePackResponse(
        boolean enabled,
        Map<String, Integer> items) {
}
