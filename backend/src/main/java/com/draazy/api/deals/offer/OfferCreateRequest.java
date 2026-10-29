package com.draazy.api.deals.offer;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record OfferCreateRequest(
        @NotBlank String propertyId,
        @NotNull @Positive Long amount,
        @Size(max = 1000) String message,
        LocalDate moveIn) {
}
