package com.draazy.api.engagement.history;

import java.time.Instant;

public record RecentSearchDto(String label, String url, Instant at) {
}
