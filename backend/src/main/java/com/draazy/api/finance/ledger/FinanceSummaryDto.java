package com.draazy.api.finance.ledger;

public record FinanceSummaryDto(
        Long income,
        Long expense,
        Long net,
        Double occupancyRate) {
}
