package com.draazy.api.engagement.flatmate;

import java.time.LocalDate;
import java.time.ZoneId;

final class FlatmateApprovals {

    private static final ZoneId IST = ZoneId.of("Asia/Kolkata");

    /** Both evidence dates, so the one body approves a rent agreement or a light bill alike. */
    static String checks() {
        LocalDate today = LocalDate.now(IST);
        return "\"checks\":{\"nameMatches\":true,\"addressMatches\":true,\"validTill\":\"%s\",\"issuedOn\":\"%s\"}"
                .formatted(today.plusDays(200), today.minusDays(10));
    }

    static String approve() {
        return "{\"decision\":\"approved\"," + checks() + "}";
    }

    static String approve(String note) {
        return "{\"decision\":\"approved\",\"note\":\"%s\",%s}".formatted(note, checks());
    }

    static String decision(String decision, String note) {
        return "approved".equals(decision)
                ? approve(note)
                : "{\"decision\":\"%s\",\"note\":\"%s\"}".formatted(decision, note);
    }

    private FlatmateApprovals() {
    }
}