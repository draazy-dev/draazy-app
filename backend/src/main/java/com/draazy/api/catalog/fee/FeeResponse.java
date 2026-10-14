package com.draazy.api.catalog.fee;

// Whole rupees. A null stampDuty or registration means computed per agreement, not zero.
public record FeeResponse(
        String deal,
        Long brokerage,
        Long platformFee,
        Long stampDuty,
        Long registration,
        String notes) {
}
