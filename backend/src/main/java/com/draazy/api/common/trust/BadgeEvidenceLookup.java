package com.draazy.api.common.trust;

import java.util.UUID;

public interface BadgeEvidenceLookup {
    Hold holdOn(UUID documentId);

    enum Hold {
        NONE,

        CITED,

        LIVE_BADGE
    }
}
