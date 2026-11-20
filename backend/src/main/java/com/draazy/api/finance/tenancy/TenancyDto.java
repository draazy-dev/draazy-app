package com.draazy.api.finance.tenancy;

import java.time.LocalDate;

public record TenancyDto(
        String id,
        String propertyId,
        Party tenant,
        Party owner,
        Long rent,
        Long deposit,
        LocalDate startDate,
        LocalDate endDate,
        String status) {
    public record Party(String id, String name, String mobile, String role) {
    }
}
