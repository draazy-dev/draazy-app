package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ContactUsageLookup {
    List<Instant> contactTimes(UUID userId);
}
