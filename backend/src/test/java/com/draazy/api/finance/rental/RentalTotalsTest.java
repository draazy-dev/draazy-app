package com.draazy.api.finance.rental;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

class RentalTotalsTest {
    @Nested
    @DisplayName("months due")
    class MonthsDue {
        @Test
        @DisplayName("the month the lease starts counts from the start date, not before it")
        void firstInstalmentFallsOnTheStartDate() {
            LocalDate start = LocalDate.of(2025, 1, 10);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 1, 9))).isZero();
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 1, 10))).isEqualTo(1);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 1, 31))).isEqualTo(1);
        }

        @Test
        @DisplayName("the next instalment waits for the day of the month to come round")
        void secondInstalmentWaitsForTheSameDayOfMonth() {
            LocalDate start = LocalDate.of(2025, 1, 10);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 2, 9))).isEqualTo(1);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 2, 10))).isEqualTo(2);
        }

        @Test
        @DisplayName("a lease starting on the 31st falls due on the 28th in February")
        void monthEndStartsClampToTheShorterMonth() {
            LocalDate start = LocalDate.of(2025, 1, 31);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 2, 27))).isEqualTo(1);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 2, 28))).isEqualTo(2);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 3, 30))).isEqualTo(2);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 3, 31))).isEqualTo(3);
        }

        @Test
        @DisplayName("and on the 29th in a leap February")
        void monthEndStartsClampInALeapYear() {
            LocalDate start = LocalDate.of(2024, 1, 31);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2024, 2, 28))).isEqualTo(1);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2024, 2, 29))).isEqualTo(2);
        }

        @Test
        @DisplayName("an ended lease stops accruing at its end date")
        void endedLeaseStopsAtLeaseEnd() {
            LocalDate start = LocalDate.of(2025, 1, 1);
            LocalDate end = LocalDate.of(2025, 6, 1);
            assertThat(RentalTotals.monthsDue(start, end, LocalDate.of(2025, 12, 31))).isEqualTo(6);
            assertThat(RentalTotals.monthsDue(start, end, LocalDate.of(2031, 12, 31))).isEqualTo(6);
        }

        @Test
        @DisplayName("a lease that has not begun, or whose window is inverted, accrues nothing")
        void nothingAccruesBeforeTheLeaseBegins() {
            LocalDate start = LocalDate.of(2025, 6, 1);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 1, 1))).isZero();
            assertThat(RentalTotals.monthsDue(start, LocalDate.of(2024, 1, 1),
                    LocalDate.of(2025, 12, 1))).isZero();
        }
    }

    @Nested
    @DisplayName("the financial year")
    class FinancialYear {
        @Test
        @DisplayName("runs 1 April to 31 March")
        void yearStartsInApril() {
            assertThat(RentalTotals.financialYearStart(LocalDate.of(2025, 3, 31)))
                    .isEqualTo(LocalDate.of(2024, 4, 1));
            assertThat(RentalTotals.financialYearStart(LocalDate.of(2025, 4, 1)))
                    .isEqualTo(LocalDate.of(2025, 4, 1));
            assertThat(RentalTotals.financialYearStart(LocalDate.of(2025, 12, 31)))
                    .isEqualTo(LocalDate.of(2025, 4, 1));
        }

        @Test
        @DisplayName("a lease starting 31 March counts its April instalment in the new year")
        void leaseStartingOnTheLastDayOfTheYear() {
            LocalDate start = LocalDate.of(2025, 3, 31);
            assertThat(RentalTotals.monthsDueInFinancialYear(start, null, LocalDate.of(2025, 3, 31)))
                    .isEqualTo(1);
            assertThat(RentalTotals.monthsDueInFinancialYear(start, null, LocalDate.of(2025, 4, 30)))
                    .isEqualTo(1);
            assertThat(RentalTotals.monthsDue(start, null, LocalDate.of(2025, 4, 30))).isEqualTo(2);
        }

        @Test
        @DisplayName("a lease starting exactly on 1 April counts every month of its first year")
        void leaseStartingOnTheFirstDayOfTheYear() {
            LocalDate start = LocalDate.of(2025, 4, 1);
            assertThat(RentalTotals.monthsDueInFinancialYear(start, null, LocalDate.of(2026, 3, 1)))
                    .isEqualTo(12);
            assertThat(RentalTotals.monthsDueInFinancialYear(start, null, LocalDate.of(2026, 4, 1)))
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("a lease that ended in an earlier year contributes nothing to this one")
        void leaseEndedInAnEarlierYear() {
            LocalDate start = LocalDate.of(2023, 1, 1);
            LocalDate end = LocalDate.of(2023, 12, 1);
            assertThat(RentalTotals.monthsDueInFinancialYear(start, end, LocalDate.of(2025, 6, 15)))
                    .isZero();
            assertThat(RentalTotals.monthsDue(start, end, LocalDate.of(2025, 6, 15))).isEqualTo(12);
        }

        @Test
        @DisplayName("the yearly figure is never more than the lifetime one, and never negative")
        void yearlyNeverExceedsLifetime() {
            LocalDate start = LocalDate.of(2024, 7, 15);
            for (int day = 0; day < 400; day++) {
                LocalDate asOf = LocalDate.of(2025, 1, 1).plusDays(day);
                long fy = RentalTotals.monthsDueInFinancialYear(start, null, asOf);
                assertThat(fy)
                        .as("financial-year instalments on %s", asOf)
                        .isBetween(0L, RentalTotals.monthsDue(start, null, asOf));
            }
        }
    }

    @Nested
    @DisplayName("totals")
    class Totals {
        @Test
        @DisplayName("multiply the instalments by the rent, and read an absent rent as zero")
        void multipliesInstalmentsByRent() {
            assertThat(RentalTotals.total(7, 20_000L)).isEqualTo(140_000L);
            assertThat(RentalTotals.total(0, 20_000L)).isZero();
            assertThat(RentalTotals.total(7, null)).isZero();
        }
    }
}
