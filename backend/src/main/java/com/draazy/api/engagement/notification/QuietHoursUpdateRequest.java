package com.draazy.api.engagement.notification;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record QuietHoursUpdateRequest(
        @NotNull Boolean enabled,
        @NotNull @Pattern(regexp = "^([01][0-9]|2[0-3]):[0-5][0-9]$",
                message = "must be a 24-hour HH:mm time") String start,
        @NotNull @Pattern(regexp = "^([01][0-9]|2[0-3]):[0-5][0-9]$",
                message = "must be a 24-hour HH:mm time") String end) {
}
