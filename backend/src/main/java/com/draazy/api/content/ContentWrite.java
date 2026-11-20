package com.draazy.api.content;

import java.util.Map;

public record ContentWrite(
        String question,
        String answer,
        String category,
        Map<String, Map<String, String>> translations) {
}