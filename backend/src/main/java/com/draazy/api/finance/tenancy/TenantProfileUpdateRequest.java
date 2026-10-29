package com.draazy.api.finance.tenancy;

import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

// score, verified and mobile are absent so a client cannot set the screening score or file
// a profile against someone else's number.
public record TenantProfileUpdateRequest(
        @Size(max = 120) String name,
        @Size(max = 120) String occupation,
        @PositiveOrZero Long income,
        String occupants,
        LocalDate moveIn,
        @Size(max = 200) String priorLandlord,
        @Size(max = 2000) String about) {
}
