package com.draazy.api.common.trust;

import java.util.UUID;

public interface ContactGate {
    ContactVisibility visibilityFor(UUID viewerId, UUID propertyId, UUID ownerId);
}
