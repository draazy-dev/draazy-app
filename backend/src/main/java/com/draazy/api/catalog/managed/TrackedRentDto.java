package com.draazy.api.catalog.managed;

import java.time.LocalDate;
import java.util.List;

/** A home an owner tracks rent for, as its tenant sees it; receipts are only those minted since they were named.
 * {@code status} is server-side because a month paid before they were named has no receipt they can see. */
public record TrackedRentDto(
        String id,
        String title,
        String address,
        String landlordName,
        long monthlyRent,
        int dueDay,
        String status,
        LocalDate dueOn,
        List<ManagedRentReceiptDto> receipts) {
}
