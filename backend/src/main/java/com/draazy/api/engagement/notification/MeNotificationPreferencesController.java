package com.draazy.api.engagement.notification;

import com.draazy.api.common.web.Routes;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.CurrentUser;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeNotificationPreferencesController {
    private final NotificationPreferenceService preferenceService;

    public MeNotificationPreferencesController(NotificationPreferenceService preferenceService) {
        this.preferenceService = preferenceService;
    }

    @GetMapping(Routes.Engagement.NOTIFICATION_PREFERENCES)
    public NotificationPreferencesDto getNotificationPreferences(@CurrentUser AuthPrincipal principal) {
        return preferenceService.get(principal.userId());
    }

    @PutMapping(Routes.Engagement.NOTIFICATION_PREFERENCES)
    public NotificationPreferencesDto updateNotificationPreferences(
            @CurrentUser AuthPrincipal principal,
            @Valid @RequestBody NotificationPreferencesUpdateRequest body) {
        return preferenceService.update(principal.userId(), body);
    }
}
