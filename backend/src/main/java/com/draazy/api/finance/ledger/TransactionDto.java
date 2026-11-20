package com.draazy.api.finance.ledger;

import java.time.LocalDate;

public record TransactionDto(
        String id,
        String propertyId,
        String type,
        String category,
        Long amount,
        LocalDate date,
        String note,
        String recurring) {
}
