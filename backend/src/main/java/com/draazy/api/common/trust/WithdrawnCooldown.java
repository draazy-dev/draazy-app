package com.draazy.api.common.trust;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;

/** How long a requester must wait before asking again on a listing they withdrew from. */
public final class WithdrawnCooldown {

    private static final Duration LENGTH = Duration.ofDays(7);
    private static final DateTimeFormatter DAY =
            DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH).withZone(ZoneId.of("Asia/Kolkata"));

    private WithdrawnCooldown() {
    }

    public static boolean active(Instant withdrawnAt, Instant now) {
        return withdrawnAt.plus(LENGTH).isAfter(now);
    }

    public static ConflictException refusal(Instant withdrawnAt) {
        return new ConflictException(ErrorCodes.RECENTLY_WITHDRAWN,
                "You withdrew this request recently. You can ask again from " + DAY.format(withdrawnAt.plus(LENGTH)) + ".");
    }
}
