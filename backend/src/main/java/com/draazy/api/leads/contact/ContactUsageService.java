package com.draazy.api.leads.contact;

import com.draazy.api.common.trust.ContactEnquiryLookup;
import com.draazy.api.common.trust.ContactUsageLookup;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The {@code leads} side of the contact quota; a separate bean so billing reaches one short read and nothing else. */
@Service
public class ContactUsageService implements ContactUsageLookup, ContactEnquiryLookup {

    private final ContactRequestRepository requests;
    private final ContactReplyWindow window;

    ContactUsageService(ContactRequestRepository requests, ContactReplyWindow window) {
        this.requests = requests;
        this.window = window;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Instant> contactTimes(UUID userId) {
        return userId == null ? List.of() : requests.findCountedFirstRequestedAt(userId, window.cutoff(Instant.now()));
    }

    @Override
    @Transactional(readOnly = true)
    public long enquiriesBetween(UUID propertyId, Instant from, Instant to) {
        return requests.countEnquiredBetween(propertyId, from, to);
    }
}
