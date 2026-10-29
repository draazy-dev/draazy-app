package com.draazy.api.finance.ledger;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

public record TransactionUpdateRequest(
        String type,
        @Size(max = 100) String category,
        @Positive Long amount,
        LocalDate date,
        @Size(max = 1000) String note,
        String recurring) {
}
