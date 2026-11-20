package com.draazy.api.common.trust;

import java.util.Collection;
import java.util.Map;
import java.util.UUID;

public interface PendingLeadLookup {
    Map<UUID, Integer> pendingFor(Collection<UUID> propertyIds);
}
