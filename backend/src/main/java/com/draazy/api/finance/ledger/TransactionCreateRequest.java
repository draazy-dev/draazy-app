package com.draazy.api.finance.ledger;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record TransactionCreateRequest(
        @NotNull String type,
        @Size(max = 100) String category,
        @NotNull @Positive Long amount,
        @NotNull LocalDate date,
        @Size(max = 1000) String note,
        String recurring) {
}
