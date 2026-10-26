package com.draazy.api.engagement.flatmate;

/** Cards waiting on each tab of the moderation desk, counted by the server rather than by the
 * length of whatever window the browser happened to download. */
public record FlatmateModerationSummary(long pending, long badgeRequests, long published, long hidden) {

    /** Both queues a flatmates staffer works; dashboard tiles read this, not {@code pending}. */
    public long awaiting() {
        return pending + badgeRequests;
    }
}
