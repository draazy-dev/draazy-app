package com.draazy.api.common.trust;

import java.util.Collection;
import java.util.Set;
import java.util.UUID;

public interface VerifiedTenantLookup {
    Set<UUID> verifiedAmong(Collection<UUID> userIds);
}
