package com.draazy.api.finance.ledger;

import java.util.List;

public record FinanceOverviewDto(
        OwnershipBasisDto basis,
        List<DueDto> dues,
        List<CashflowPointDto> cashflow) {
}
