package com.draazy.api.leads.contact;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.ContactEnquiryLookup;
import com.draazy.api.common.trust.ContactUsageLookup;
import com.draazy.api.common.trust.ContactUse;
import com.draazy.api.common.trust.VisitUsageLookup;
import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContactUsageService implements ContactUsageLookup, ContactEnquiryLookup {
    record Uses(Map<UUID, Instant> spentAt, Set<UUID> awaitingReply) {
    }

    private final ContactRequestRepository requests;
    private final VisitUsageLookup visits;
    private final ContactReplyWindow window;
    private final PropertyRepository properties;

    ContactUsageService(ContactRequestRepository requests, VisitUsageLookup visits, ContactReplyWindow window,
            PropertyRepository properties) {
        this.requests = requests;
        this.visits = visits;
        this.window = window;
        this.properties = properties;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ContactUse> contactUses(UUID userId) {
        if (userId == null) {
            return List.of();
        }
        Map<UUID, Instant> spentAt = uses(userId, window.cutoff(Instant.now())).spentAt();
        if (spentAt.isEmpty()) {
            return List.of();
        }
        Map<UUID, String> deals = new HashMap<>();
        properties.findDealsByIdIn(spentAt.keySet()).forEach(d -> deals.put(d.getId(), d.getDeal()));
        return spentAt.entrySet().stream()
                .map(e -> new ContactUse(e.getValue(), deals.get(e.getKey())))
                .sorted(Comparator.comparing(ContactUse::at))
                .toList();
    }

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
