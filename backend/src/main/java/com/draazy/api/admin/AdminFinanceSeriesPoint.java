package com.draazy.api.admin;

import java.time.LocalDate;

/** Draazy's fees for one IST month by source, and the fees credited back that month. */
public record AdminFinanceSeriesPoint(
        LocalDate month,
        long subscriptions,
        long services,
        long refunds) {
}
