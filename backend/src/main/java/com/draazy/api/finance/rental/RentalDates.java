package com.draazy.api.finance.rental;

import com.draazy.api.common.PlatformTime;
import java.time.LocalDate;

final class RentalDates {
    private RentalDates() {
    }

    private static final LocalDate FLOOR = LocalDate.of(1970, 1, 1);

    private static final int MAX_YEARS_AHEAD = 2;

    static boolean isSane(LocalDate date) {
        if (date == null) {
            return true;
        }
        LocalDate ceiling = LocalDate.now(PlatformTime.IST).plusYears(MAX_YEARS_AHEAD);
        return !date.isBefore(FLOOR) && !date.isAfter(ceiling);
    }
}
