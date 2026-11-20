package com.draazy.api.finance.ledger;

import java.time.LocalDate;

public record OwnershipBasisDto(
        Long purchasePrice,
        LocalDate purchaseDate,
        Long loanOutstanding,
        Long emi,
        Long currentValue) {
}
