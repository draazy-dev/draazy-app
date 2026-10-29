package com.draazy.api.admin;

public record AdminKpis(
        long totalListings,
        long activeListings,
        long pendingModeration,
        long openReports,
        long totalUsers,
        long newUsers7d,
        long dealsClosed30d,
        Long revenue30d) {
}
