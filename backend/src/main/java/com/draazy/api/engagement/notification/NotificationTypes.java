package com.draazy.api.engagement.notification;

final class NotificationTypes {
    private static final String[] ALERT_FAMILIES = {"match", "price"};

    private NotificationTypes() {
    }

    static boolean isMatchAlert(String type) {
        if (type == null) {
            return false;
        }
        for (String family : ALERT_FAMILIES) {
            if (type.equals(family) || type.startsWith(family + ".")) {
                return true;
            }
        }
        return false;
    }
}
