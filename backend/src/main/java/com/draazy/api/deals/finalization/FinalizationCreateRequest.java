package com.draazy.api.deals.finalization;

import com.draazy.api.common.validation.IndianMobile;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record FinalizationCreateRequest(
        String propertyId,
        @NotBlank @IndianMobile
        String counterpartyMobile,
        @NotNull @Positive Long agreedPrice) {
}
