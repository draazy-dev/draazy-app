package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface ContactUsageLookup {
    List<ContactUse> contactUses(UUID userId);

    default List<Instant> contactTimes(UUID userId) {
        return contactUses(userId).stream().map(ContactUse::at).toList();
    }
}
