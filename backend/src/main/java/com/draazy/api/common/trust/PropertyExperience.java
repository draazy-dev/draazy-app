package com.draazy.api.common.trust;

import java.util.UUID;

public interface PropertyExperience {
    ReviewerStanding standingOf(UUID userId, UUID propertyId);
}
