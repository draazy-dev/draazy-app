package com.draazy.api.finance.ledger;

public record CashflowPointDto(
        String month,
        Long income,
        Long expense,
        Long net) {
}
