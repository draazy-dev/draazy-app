package com.draazy.api.catalog.property;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.NotFoundException;

public final class ListingClosed {
    private ListingClosed() {
    }

    public static RuntimeException refusal(Property property) {
        boolean reachable = !property.isArchived() && !property.isOwnerSuspended()
                && PropertyStatus.DIRECTLY_REACHABLE.contains(property.getStatus());
        return reachable
                ? new ConflictException(ErrorCodes.LISTING_NOT_LIVE, "This listing is not live right now")
                : NotFoundException.of("Property");
    }
}
