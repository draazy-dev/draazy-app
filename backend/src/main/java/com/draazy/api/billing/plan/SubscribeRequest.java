package com.draazy.api.billing.plan;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/** Contract {@code SubscribeRequest}; {@code paymentMethod} is validated then dropped, and there is no price field. */
public record SubscribeRequest(
        @NotBlank String planId,
        @Pattern(regexp = "upi|card|netbanking") String paymentMethod,
        String propertyId) {
}
