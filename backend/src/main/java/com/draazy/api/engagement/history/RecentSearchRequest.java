package com.draazy.api.engagement.history;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RecentSearchRequest(
        @NotBlank @Size(max = 200) String label,
        @NotBlank @Size(max = 500) String url) {
}
