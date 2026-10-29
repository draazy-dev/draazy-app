package com.draazy.api.common.trust;

import java.util.UUID;

public interface OwnerRelationship {
    boolean exists(UUID authorId, UUID ownerId);
}
