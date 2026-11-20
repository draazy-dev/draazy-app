package com.draazy.api.deals.offer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record OfferRespondRequest(
        @NotBlank @Pattern(regexp = OfferActions.PATTERN, message = OfferActions.PATTERN_MESSAGE)
        String action,
        @Positive Long counterAmount,
        @Size(max = 1000) String message) {
}
