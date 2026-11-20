package com.draazy.api.admin;

import java.time.LocalDate;

public record AdminFinanceSeriesPoint(
        LocalDate month,
        long subscriptions,
        long services,
        long refunds) {
}
