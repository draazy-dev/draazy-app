package com.draazy.api.admin;

import java.time.LocalDate;

final class BucketDate {
    private BucketDate() {
    }

    static LocalDate of(Object bucket) {
        return switch (bucket) {
            case java.sql.Timestamp ts -> ts.toLocalDateTime().toLocalDate();
            case java.sql.Date date -> date.toLocalDate();
            case java.time.LocalDateTime dt -> dt.toLocalDate();
            case LocalDate date -> date;
            case java.time.OffsetDateTime odt -> odt.toLocalDate();
            case null, default -> throw new IllegalStateException(
                    "Unexpected bucket type from date_trunc: " + bucket);
        };
    }
}
