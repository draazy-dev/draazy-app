package com.draazy.api.leads.contact;

import com.draazy.api.catalog.property.PropertyArchived;
import com.draazy.api.catalog.property.PropertyClosed;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

// Runs in the deal-close or archive transaction: approving is refused once the listing is not live, so a pending
// request left behind could only be answered with an error.
@Component
class ClosedListingContactRequests {

    private final ContactReturns returns;

    ClosedListingContactRequests(ContactReturns returns) {
        this.returns = returns;
    }

    @EventListener
    void onClosed(PropertyClosed event) {
        returns.expirePendingForClosedListing(event.propertyId(), "was closed");
    }

    @EventListener
    void onArchived(PropertyArchived event) {
        returns.expirePendingForClosedListing(event.propertyId(), "was taken down");
    }
}
