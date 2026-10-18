package com.draazy.api.engagement.demand;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

/** Only {@code kind} is required: a filterless search is still demand. No mobile field, since the only reader
 * is a count; {@code bhk} is free text because a multi-select arrives as {@code "2/3"}. */
public record DemandSignalCreate(
        // @NotBlank as well as @Pattern: @Pattern passes a null value by design, so on its own it
        // would accept a body with no kind at all and push the failure down to the check constraint.
        @NotBlank
        @Pattern(regexp = "search|alert|view", message = "kind must be search, alert or view")
        String kind,

        // Slug-shaped, not a foreign key: unknown places still count, scanner payloads like
        // "../../etc/passwd" do not. Blank stays legal because it means "no locality" (blankToNull).
        @Size(max = 120)
        @Pattern(regexp = "\\s*|[a-z0-9]+(?:-[a-z0-9]+)*", message = "localitySlug must be a locality slug")
        String localitySlug,

        @Pattern(regexp = "buy|rent", message = "deal must be buy or rent")
        String deal,

        @Size(max = 40)
        String bhk,

        UUID propertyId) {
}
