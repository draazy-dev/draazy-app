package com.draazy.api.engagement.notification;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record NotificationPreferencesUpdateRequest(
        @NotNull Boolean email,
        @NotNull Boolean sms,
        @NotNull Boolean whatsapp,
        @NotNull Boolean matchAlerts,
        @NotNull @Valid QuietHoursUpdateRequest quietHours,
        @NotNull @Pattern(regexp = "^(en|hi|mr)$",
                message = "must be one of en, hi, mr") String language) {
}
