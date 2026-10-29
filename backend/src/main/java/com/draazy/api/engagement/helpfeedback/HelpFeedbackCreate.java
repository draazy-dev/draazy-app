package com.draazy.api.engagement.helpfeedback;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record HelpFeedbackCreate(

        @NotBlank
        @Size(max = 120)
        @Pattern(regexp = "[a-z0-9-]+", message = "slug must be lower-case letters, digits and hyphens")
        String slug,

        @NotBlank
        @Pattern(regexp = "en|hi|mr", message = "lang must be en, hi or mr")
        String lang,

        @NotNull
        Boolean helpful,

        @Size(max = 500)
        String comment,

        @Pattern(regexp = "[0-9a-fA-F-]{36}", message = "voter must be a UUID")
        String voter) {
}
