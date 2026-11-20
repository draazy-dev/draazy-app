package com.draazy.api.admin;

import java.time.LocalDate;
import java.util.UUID;

public record AdminFinanceTransaction(
        UUID id,
        LocalDate date,
        String number,
        String party,
        String kind,
        long amount,
        long fee) {
}
