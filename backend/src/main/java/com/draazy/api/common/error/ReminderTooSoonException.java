package com.draazy.api.common.error;

import java.time.Instant;

/** 409 {@code reminder_too_soon}: the body carries when the next reminder is allowed. */
public class ReminderTooSoonException extends ConflictException {

    private final Instant nextReminderAt;

    public ReminderTooSoonException(Instant nextReminderAt, String message) {
        super(ErrorCodes.REMINDER_TOO_SOON, message);
        this.nextReminderAt = nextReminderAt;
    }

    public Instant getNextReminderAt() {
        return nextReminderAt;
    }
}
