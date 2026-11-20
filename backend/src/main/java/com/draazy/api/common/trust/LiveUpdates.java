package com.draazy.api.common.trust;

import java.util.UUID;

public interface LiveUpdates {
    void notificationsChanged(UUID userId);
}
