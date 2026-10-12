package com.draazy.api.catalog.property;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.ValidationException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

/** The exact move-in date and its legacy now/15/30 bucket, reckoned on the IST calendar. */
public final class AvailableOn {

    public static final int MAX_RENT_DAYS_AHEAD = 365;
    public static final int MAX_SALE_YEARS_AHEAD = 5;
    public static final String PATTERN = "^$|^\\d{4}-\\d{2}-\\d{2}$";
    public static final String PATTERN_MESSAGE = "must be a date like 2026-12-01, or blank";

    private AvailableOn() {
    }

    public static LocalDate today() {
        return LocalDate.now(PlatformTime.IST);
    }

    /** The bucket a date falls in today; a date beyond 30 days, or none, has no bucket. */
    public static String bucketOf(LocalDate on, LocalDate today) {
        if (on == null) {
            return null;
        }
        if (!on.isAfter(today)) {
            return "now";
        }
        if (!on.isAfter(today.plusDays(15))) {
            return "15";
        }
        return on.isAfter(today.plusDays(30)) ? null : "30";
    }

    /** The date a legacy bucket stands for, or null for blank or an unknown bucket. */
    public static LocalDate fromBucket(String bucket, LocalDate today) {
        if (bucket == null) {
            return null;
        }
        return switch (bucket) {
            case "now" -> today;
            case "15" -> today.plusDays(15);
            case "30" -> today.plusDays(30);
            default -> null;
        };
    }

    /** A request's date: {@code availableOn} wins over the legacy bucket. Blank in either field yields null,
     * which on update clears the date; {@link #isStated} tells "cleared" from "not mentioned". */
    public static LocalDate resolve(String availableOn, String legacyBucket, boolean allowPast, String deal) {
        LocalDate today = today();
        if (availableOn != null) {
            return availableOn.isBlank() ? null : parse(availableOn, today, allowPast, deal);
        }
        return fromBucket(legacyBucket, today);
    }

    public static boolean isStated(String availableOn, String legacyBucket) {
        return availableOn != null || legacyBucket != null;
    }

    /** A sale's possession date can be years out; a rent's move-in date cannot. */
    static LocalDate latest(LocalDate today, String deal) {
        return DealIntent.BUY.equals(deal) ? today.plusYears(MAX_SALE_YEARS_AHEAD) : today.plusDays(MAX_RENT_DAYS_AHEAD);
    }

    public static LocalDate parse(String value, LocalDate today, boolean allowPast, String deal) {
        LocalDate on;
        try {
            on = LocalDate.parse(value);
        } catch (DateTimeParseException ex) {
            throw new ValidationException("availableOn must be a date like 2026-12-01.");
        }
        if (!allowPast && on.isBefore(today)) {
            throw new ValidationException("availableOn cannot be in the past.");
        }
        if (on.isAfter(latest(today, deal))) {
            throw new ValidationException(DealIntent.BUY.equals(deal)
                    ? "availableOn must be within the next 5 years."
                    : "availableOn must be within the next year.");
        }
        return on;
    }
}
