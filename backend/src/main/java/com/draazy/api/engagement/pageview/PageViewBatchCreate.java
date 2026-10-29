package com.draazy.api.engagement.pageview;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.util.List;

public record PageViewBatchCreate(

        @NotBlank
        @Pattern(regexp = "[A-Za-z0-9_-]{8,64}",
                message = "sessionId must be an opaque token of 8-64 URL-safe characters")
        String sessionId,

        @NotEmpty
        @Size(max = 50, message = "a flush carries at most 50 events")
        List<@Valid Item> events,

        Boolean attributed) {
    public record Item(

            @NotBlank
            @Size(max = 200)
            String path,

            @Size(max = 120)
            String referrerHost,

            @NotBlank
            @Pattern(regexp = "mobile|tablet|desktop",
                    message = "device must be mobile, tablet or desktop")
            String device,

            @NotNull
            @PositiveOrZero
            Long agoMs) {
    }
}
