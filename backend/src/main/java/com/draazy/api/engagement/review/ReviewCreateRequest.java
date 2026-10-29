package com.draazy.api.engagement.review;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.Map;

// No context, targetType or targetId: the badge is server-derived and the target comes from the path,
// so a body cannot self-award a badge or bypass the eligibility check.
public record ReviewCreateRequest(
        @NotNull @Min(1) @Max(5) Integer rating,
        @Size(max = 160) String title,
        @Size(max = 4000) String body,
        Map<String, Integer> categories,
        Boolean recommend) {
}
