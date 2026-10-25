package com.draazy.api.admin;

import java.time.LocalDate;
import java.util.UUID;

/** One invoice or credit note. A refund carries negative {@code amount} and {@code fee}. */
public record AdminFinanceTransaction(
        UUID id,
        LocalDate date,
        String number,
        String party,
        String kind,
        long amount,
        long fee) {
}
