package com.draazy.api.deals.deal;

import com.draazy.api.common.validation.IndianMobile;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record DealCloseRequest(
        @NotNull @Positive Long agreedPrice,
        @NotNull @IndianMobile
        String counterpartyMobile,
        @Size(max = 1000) String note) {
}
