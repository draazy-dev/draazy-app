package com.draazy.api.catalog.fee;

public record FeeResponse(
        String deal,
        Long brokerage,
        Long platformFee,
        Long stampDuty,
        Long registration,
        String notes) {
}
