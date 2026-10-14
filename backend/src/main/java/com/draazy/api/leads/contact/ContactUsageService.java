package com.draazy.api.leads.contact;

import com.draazy.api.common.trust.ContactEnquiryLookup;
import com.draazy.api.common.trust.ContactUsageLookup;
import com.draazy.api.common.trust.VisitUsageLookup;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The {@code leads} side of the contact quota; a separate bean so billing reaches one short read and nothing else. */
@Service
public class ContactUsageService implements ContactUsageLookup, ContactEnquiryLookup {

    // One owner contact per listing, spent by a contact request, a visit, or both; the earliest use is the spend.
    record Uses(Map<UUID, Instant> spentAt, Set<UUID> awaitingReply) {
    }

    private final ContactRequestRepository requests;
    private final VisitUsageLookup visits;
    private final ContactReplyWindow window;

    ContactUsageService(ContactRequestRepository requests, VisitUsageLookup visits, ContactReplyWindow window) {
        this.requests = requests;
        this.visits = visits;
        this.window = window;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Instant> contactTimes(UUID userId) {
        return userId == null ? List.of()
                : uses(userId, window.cutoff(Instant.now())).spentAt().values().stream().sorted().toList();
    }

    // first_requested_at, not created_at: a renewal after a return restarts it, nothing else moves it.
    Uses uses(UUID userId, Instant replyCutoff) {
        Map<UUID, Instant> spentAt = new HashMap<>();
        Set<UUID> awaitingReply = new HashSet<>();
        for (ContactRequestRepository.CountedRequest cr : requests.findCountedForQuota(userId, replyCutoff)) {
            spentAt.merge(cr.getPropertyId(), cr.getFirstRequestedAt(), ContactUsageService::earlier);
            if (ContactRequestStatuses.PENDING.equals(cr.getStatus())) {
                awaitingReply.add(cr.getPropertyId());
            }
        }
        for (VisitUsageLookup.Booking visit : visits.countedBookings(userId)) {
            spentAt.merge(visit.propertyId(), visit.bookedAt(), ContactUsageService::earlier);
            if (visit.awaitingReply()) {
                awaitingReply.add(visit.propertyId());
            }
        }
        return new Uses(Map.copyOf(spentAt), Set.copyOf(awaitingReply));
    }

    private static Instant earlier(Instant a, Instant b) {
        return a.isBefore(b) ? a : b;
    }

    @Override
    @Transactional(readOnly = true)
    public long enquiriesBetween(UUID propertyId, Instant from, Instant to) {
        return requests.countEnquiredBetween(propertyId, from, to);
    }
}
