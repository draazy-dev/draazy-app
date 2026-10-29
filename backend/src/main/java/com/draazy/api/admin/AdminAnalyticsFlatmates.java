package com.draazy.api.admin;

import java.time.LocalDate;
import java.util.List;

public record AdminAnalyticsFlatmates(int days, LocalDate from, LocalDate to, List<Week> weeks,
        Replies replies, List<LocalityRow> localities) {
    public record Week(LocalDate week, long rooms, long groups, long seekers, long requests, long matches,
            Integer replyRatePct) {
    }

    public record Replies(long sent, Integer replyRatePct, Integer acceptRatePct, Double medianReplyHours,
            long unansweredNow) {
    }

    public record LocalityRow(String locality, long supply, long demand) {
    }
}
