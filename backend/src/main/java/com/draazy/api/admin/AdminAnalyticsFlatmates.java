package com.draazy.api.admin;

import java.time.LocalDate;
import java.util.List;

/** Throughput per IST week, like {@link AdminAnalyticsFunnel}: each count is what happened that week, not a cohort. */
public record AdminAnalyticsFlatmates(int days, LocalDate from, LocalDate to, List<Week> weeks,
        Replies replies, List<LocalityRow> localities) {

    /** {@code replyRatePct} is null, not 0, when no request sent that week is old enough to judge. */
    public record Week(LocalDate week, long rooms, long groups, long seekers, long requests, long matches,
            Integer replyRatePct) {
    }

    /** Rates and the median are null, not 0, when nothing in the window could be measured. */
    public record Replies(long sent, Integer replyRatePct, Integer acceptRatePct, Double medianReplyHours,
            long unansweredNow) {
    }

    /** Live now and unwindowed. Supply: rooms and groups with a flat. Demand: seekers and hunting groups. */
    public record LocalityRow(String locality, long supply, long demand) {
    }
}
