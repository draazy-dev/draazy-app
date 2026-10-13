package com.draazy.api.common.settings;

import org.springframework.stereotype.Component;

/** Builds the public {@link LegalResponse}; never the raw {@code legal} block. */
@Component
public class LegalController {

    private final PlatformSettings settings;

    public LegalController(PlatformSettings settings) {
        this.settings = settings;
    }

    public LegalResponse legal() {
        return new LegalResponse(settings.grievanceOfficer());
    }
}
