package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** When did this caller open each owner contact? Read from {@code contact_requests}, so it cannot drift. */
public interface ContactUsageLookup {

    /** Oldest first; empty for a caller who never asked or does not exist. */
    List<Instant> contactTimes(UUID userId);
}
