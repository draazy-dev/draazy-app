package com.draazy.api.engagement.notification;

import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationPreferenceService {
    static final NotificationPreferencesDto DEFAULTS = new NotificationPreferencesDto(
            true, false, true, true, new QuietHoursDto(false, "22:00", "07:00"), "en", false);

    private final NotificationPreferenceRepository preferences;
    private final NotificationRepository notifications;

    public NotificationPreferenceService(NotificationPreferenceRepository preferences,
            NotificationRepository notifications) {
        this.preferences = preferences;
        this.notifications = notifications;
    }

    @Transactional(readOnly = true)
    public NotificationPreferencesDto get(UUID userId) {
        return effective(userId);
    }

    @Transactional
    public NotificationPreferencesDto update(UUID userId, NotificationPreferencesUpdateRequest body) {
        NotificationPreference row = preferences.findById(userId)
                .orElseGet(() -> new NotificationPreference(userId));
        row.replace(
                body.email(),
                body.sms(),
                body.whatsapp(),
                body.matchAlerts(),
                body.quietHours().enabled(),
                body.quietHours().start(),
                body.quietHours().end(),
                body.language(),
                body.marketingCalls());
        NotificationPreferencesDto saved = NotificationPreferencesDto.of(preferences.saveAndFlush(row));
        if (!saved.quietHours().enabled()) {
            notifications.releaseDeferred(userId);
        }
        return saved;
    }

    NotificationPreferencesDto effective(UUID userId) {
        return preferences.findById(userId).map(NotificationPreferencesDto::of).orElse(DEFAULTS);
    }
}
