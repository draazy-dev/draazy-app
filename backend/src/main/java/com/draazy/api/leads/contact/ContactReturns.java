package com.draazy.api.leads.contact;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.Notifier;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ContactReturns {
    private static final int BATCH = 500;

    private final ContactRequestRepository requests;
    private final PropertyRepository properties;
    private final Notifier notifier;
    private final ContactReplyWindow window;

    ContactReturns(ContactRequestRepository requests, PropertyRepository properties, Notifier notifier,
            ContactReplyWindow window) {
        this.requests = requests;
        this.properties = properties;
        this.notifier = notifier;
        this.window = window;
    }

    void notifySeeker(ContactRequest row, String what) {
        String listing = properties.findById(row.getPropertyId()).map(Property::getTitle).orElse("The owner");
        notifier.notify(row.getRequesterId(), "contact.returned", "Your contact is back",
                listing + " " + what + " \u2014 your contact is back.", "/property/" + row.getPropertyId());
    }

    @Transactional
    public void expirePendingForClosedListing(UUID propertyId, String what) {
        for (ContactRequest row : requests.findByPropertyIdAndStatus(propertyId, ContactRequestStatuses.PENDING)) {
            if (requests.updateStatusIfCurrent(row.getId(), ContactRequestStatuses.PENDING,
                    ContactRequestStatuses.EXPIRED) > 0) {
                notifySeeker(row, what);
            }
        }
    }

    @Transactional
    public int expireOverdue(Instant now) {
        int expired = 0;
        for (ContactRequest row : requests.findOverduePending(window.cutoff(now), Limit.of(BATCH))) {
            if (requests.updateStatusIfCurrent(row.getId(), ContactRequestStatuses.PENDING,
                    ContactRequestStatuses.EXPIRED) > 0) {
                notifySeeker(row, "didn't reply");
                expired++;
            }
        }
        return expired;
    }
}
