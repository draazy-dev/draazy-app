package com.draazy.api.finance.ledger;

import java.time.LocalDate;

public final class SummaryPeriods {
    private SummaryPeriods() {
    }

    public static final String ALL = "all";

    public static final String MONTH = "month";

    public static final String QUARTER = "quarter";

    public static final String YEAR = "year";

    public static boolean isValid(String value) {
        return ALL.equals(value)
                || MONTH.equals(value)
                || QUARTER.equals(value)
                || YEAR.equals(value);
    }

    public static LocalDate startOf(String period, LocalDate today) {
        return switch (period) {
            case ALL -> null;
            case MONTH -> today.withDayOfMonth(1);
            case QUARTER -> today.withDayOfMonth(1)
                    .withMonth(((today.getMonthValue() - 1) / 3) * 3 + 1);
            case YEAR -> today.getMonthValue() >= 4
                    ? LocalDate.of(today.getYear(), 4, 1)
                    : LocalDate.of(today.getYear() - 1, 4, 1);
            default -> throw new IllegalArgumentException("Unknown period: " + period);
        };
    }
}
