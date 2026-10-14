package com.draazy.api.common.trust;

import java.util.UUID;

// The evidence spans leads, deals and finance, so reviews ask through this port rather than import them.
public interface OwnerRelationship {

    // An approved contact request, completed visit, accepted offer, closed deal, accepted
    // finalization or a tenancy (any status) between the author and this owner's listings.
    boolean exists(UUID authorId, UUID ownerId);
}
