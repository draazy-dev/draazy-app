package com.draazy.api.common.error;

import java.time.Instant;

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
