package com.draazy.api.finance.ledger;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

public final class RecurringIntervals {
    private RecurringIntervals() {
    }

    public static final String NONE = "none";

    public static final String MONTHLY = "monthly";

    public static final String QUARTERLY = "quarterly";

    public static final String YEARLY = "yearly";

    public static boolean isValid(String value) {
        return NONE.equals(value)
                || MONTHLY.equals(value)
                || QUARTERLY.equals(value)
                || YEARLY.equals(value);
    }

    public static boolean repeats(String value) {
        return isValid(value) && !NONE.equals(value);
    }

    // Step from the anchor (anchor.plusMonths(n)), never the previous step:
    // iterating clamps month-end dates permanently.
    public static LocalDate nextOccurrenceOnOrAfter(LocalDate anchor, String interval,
                                                    LocalDate today) {
        if (anchor == null || !repeats(interval)) {
            return null;
        }
        if (!anchor.isBefore(today)) {
            return anchor;
        }
        int monthsPerPeriod = switch (interval) {
            case MONTHLY -> 1;
            case QUARTERLY -> 3;
            case YEARLY -> 12;
            default -> throw new IllegalStateException("Unreachable: " + interval);
        };
        long periods = ChronoUnit.MONTHS.between(anchor, today) / monthsPerPeriod;
        LocalDate next = anchor.plusMonths(periods * monthsPerPeriod);
        while (next.isBefore(today)) {
            periods++;
            next = anchor.plusMonths(periods * monthsPerPeriod);
        }
        return next;
    }
}
