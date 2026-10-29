package com.draazy.api.catalog.managed;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record ManagedRentReceiptCreateRequest(
        @NotBlank
        @Pattern(regexp = ManagedRentReceipt.MONTH_PATTERN, message = "rentMonth must be YYYY-MM")
        String rentMonth) {
}
