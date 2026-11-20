package com.draazy.api.finance.tenancy;

import jakarta.validation.constraints.AssertTrue;
import java.time.LocalDate;

public record TenancyDeclarationCreateRequest(LocalDate livedFrom, LocalDate livedTo) {
    @AssertTrue(message = "livedTo cannot be before livedFrom")
    public boolean isDateRangeOrdered() {
        return livedFrom == null || livedTo == null || !livedTo.isBefore(livedFrom);
    }
}
