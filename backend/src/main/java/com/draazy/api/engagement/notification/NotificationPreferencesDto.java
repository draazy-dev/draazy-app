package com.draazy.api.engagement.notification;

public record NotificationPreferencesDto(
        boolean email,
        boolean sms,
        boolean whatsapp,
        boolean matchAlerts,
        QuietHoursDto quietHours,
        String language,
        boolean marketingCalls) {
    static NotificationPreferencesDto of(NotificationPreference row) {
        return new NotificationPreferencesDto(
                row.isEmail(),
                row.isSms(),
                row.isWhatsapp(),
                row.isMatchAlerts(),
                new QuietHoursDto(row.isQuietHoursEnabled(), row.getQuietStart(), row.getQuietEnd()),
                row.getLanguage(),
                row.getMarketingConsentAt() != null);
    }
}
