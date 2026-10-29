package com.draazy.api.leads.contact;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record ContactRequestCreate(
        @NotBlank String propertyId,
        @Size(max = 1000) String message) {
}
