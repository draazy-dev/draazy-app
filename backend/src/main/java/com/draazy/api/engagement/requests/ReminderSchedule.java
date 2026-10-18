package com.draazy.api.engagement.requests;

import com.draazy.api.common.trust.RequestSource.RequestView;
import java.time.Duration;
import java.time.Instant;

final class ReminderSchedule {

    static final Duration GAP = Duration.ofDays(1);

    private ReminderSchedule() {
    }

    /** The first moment another reminder is allowed: a day after sending, then a day after the last reminder. */
    static Instant earliest(Instant createdAt, Instant lastAt) {
        Instant afterSending = createdAt.plus(GAP);
        Instant afterLast = lastAt == null ? afterSending : lastAt.plus(GAP);
        return afterLast.isAfter(afterSending) ? afterLast : afterSending;
    }

    /** What a client may show as the next reminder time: null once the request would have lapsed by then. */
    static Instant nextShown(RequestView request, Instant lastAt) {
        Instant earliest = earliest(request.createdAt(), lastAt);
        return request.expiresAt() != null && earliest.isAfter(request.expiresAt()) ? null : earliest;
    }
}
