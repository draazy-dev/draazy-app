package com.draazy.api.content;

import java.util.Map;

public record FaqResponse(
        String id,
        String question,
        String answer,
        String category,
        Map<String, Map<String, String>> translations) {
}
