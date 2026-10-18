package com.draazy.api.engagement.requests;

import java.time.Instant;

public record RequestReminderResponse(long count, Instant lastAt, Instant nextAt) {
}
