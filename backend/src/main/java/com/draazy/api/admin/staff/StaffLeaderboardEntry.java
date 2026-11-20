package com.draazy.api.admin.staff;

public record StaffLeaderboardEntry(
        String actor,
        String name,
        String role,
        String team,
        long total) {
}
