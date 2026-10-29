package com.draazy.api.billing.plan;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record SubscribeRequest(
        @NotBlank String planId,
        @Pattern(regexp = "upi|card|netbanking") String paymentMethod,
        String propertyId) {
}
