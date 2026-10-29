package com.draazy.api.finance.tenancy;

import java.time.LocalDate;

public record TenantProfileDto(
        String mobile,
        String name,
        String occupation,
        Long income,
        String occupants,
        LocalDate moveIn,
        String priorLandlord,
        String about,
        Integer score,
        boolean verified) {
}
