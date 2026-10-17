package com.draazy.api.catalog.property;

import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.NotFoundException;

/** The one refusal for an action on a listing a visitor cannot act on, so visits and contacts agree. */
public final class ListingClosed {

    private ListingClosed() {
    }

    /** Closed (409) when a visitor can still open it; otherwise it is not visible to them (404). */
    public static RuntimeException refusal(Property property) {
        boolean reachable = !property.isArchived() && !property.isOwnerSuspended()
                && PropertyStatus.DIRECTLY_REACHABLE.contains(property.getStatus());
        return reachable
                ? new ConflictException(ErrorCodes.LISTING_NOT_LIVE, "This listing is not live right now")
                : NotFoundException.of("Property");
    }
}
