package com.draazy.api.finance.rental;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;

final class RentalTotals {
    private RentalTotals() {
    }

    private static final int FY_START_MONTH = 4;

    static long monthsDue(LocalDate leaseStart, LocalDate leaseEnd, LocalDate asOf) {
        if (leaseStart == null || asOf == null) {
            return 0L;
        }
        LocalDate until = leaseEnd != null && leaseEnd.isBefore(asOf) ? leaseEnd : asOf;
        if (until.isBefore(leaseStart)) {
            return 0L;
        }
        long months = ChronoUnit.MONTHS.between(YearMonth.from(leaseStart), YearMonth.from(until));
        if (leaseStart.plusMonths(months).isAfter(until)) {
            months--;
        }
        return months + 1;
    }

    static long monthsDueInFinancialYear(LocalDate leaseStart, LocalDate leaseEnd, LocalDate asOf) {
        if (leaseStart == null || asOf == null) {
            return 0L;
        }
        LocalDate fyStart = financialYearStart(asOf);
        return monthsDue(leaseStart, leaseEnd, asOf)
                - monthsDue(leaseStart, leaseEnd, fyStart.minusDays(1));
    }

    static LocalDate financialYearStart(LocalDate date) {
        int year = date.getMonthValue() >= FY_START_MONTH ? date.getYear() : date.getYear() - 1;
        return LocalDate.of(year, FY_START_MONTH, 1);
    }

    static long total(long months, Long monthlyRent) {
        return monthlyRent == null ? 0L : months * monthlyRent;
    }
}
