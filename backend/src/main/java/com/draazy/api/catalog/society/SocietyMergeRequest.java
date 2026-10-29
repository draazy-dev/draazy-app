package com.draazy.api.catalog.society;

import jakarta.validation.constraints.NotBlank;

public record SocietyMergeRequest(
        @NotBlank(message = "Say which society is the duplicate.") String from,
        @NotBlank(message = "Say which society survives the merge.") String into) {
}
