package com.draazy.api.common.trust;

import java.util.UUID;

public interface NewAccountAnnouncer {
    void accountCreated(UUID userId, String mobile);
}
