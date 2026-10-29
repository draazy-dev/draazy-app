package com.draazy.api.finance.tenancy;

import java.time.Instant;
import java.time.LocalDate;

public record TenancyDeclarationDto(
        String id,
        String propertyId,
        String declarantId,
        String declarantName,
        LocalDate livedFrom,
        LocalDate livedTo,
        String status,
        Instant decidedAt) {
}
