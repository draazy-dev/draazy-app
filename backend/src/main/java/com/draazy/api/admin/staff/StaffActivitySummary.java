package com.draazy.api.admin.staff;

import java.util.List;

public record StaffActivitySummary(
        long total,
        long staffCount,
        List<StaffActivityCount> byEntity,
        List<String> actions,
        List<StaffLeaderboardEntry> leaderboard) {
}
