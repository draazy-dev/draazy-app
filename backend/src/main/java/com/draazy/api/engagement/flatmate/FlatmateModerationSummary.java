package com.draazy.api.engagement.flatmate;

public record FlatmateModerationSummary(long pending, long badgeRequests, long published, long hidden) {
    public long awaiting() {
        return pending + badgeRequests;
    }
}
