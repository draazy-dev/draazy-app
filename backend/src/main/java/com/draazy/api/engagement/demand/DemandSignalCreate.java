package com.draazy.api.engagement.demand;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record DemandSignalCreate(
        @NotBlank
        @Pattern(regexp = "search|alert|view", message = "kind must be search, alert or view")
        String kind,

        @Size(max = 120)
        @Pattern(regexp = "\\s*|[a-z0-9]+(?:-[a-z0-9]+)*", message = "localitySlug must be a locality slug")
        String localitySlug,

        @Pattern(regexp = "buy|rent", message = "deal must be buy or rent")
        String deal,

        @Size(max = 40)
        String bhk,

        UUID propertyId) {
}
