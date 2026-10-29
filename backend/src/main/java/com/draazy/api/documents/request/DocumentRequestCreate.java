package com.draazy.api.documents.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.List;

public record DocumentRequestCreate(
        @NotBlank String propertyId,
        List<@Size(max = 80) String> categories,
        @Size(max = 500) String message,
        Boolean acknowledgedDisclaimer) {
}
