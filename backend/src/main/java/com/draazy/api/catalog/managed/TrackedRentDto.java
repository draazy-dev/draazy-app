package com.draazy.api.catalog.managed;

import java.time.LocalDate;
import java.util.List;

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
