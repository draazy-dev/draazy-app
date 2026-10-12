package com.draazy.api.leads.contact;

import com.draazy.api.common.trust.ContactUsageLookup;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The {@code leads} side of the contact quota; a separate bean so billing reaches one short read and nothing else. */
@Service
public class ContactUsageService implements ContactUsageLookup {

    private final ContactRequestRepository requests;

    public ContactUsageService(ContactRequestRepository requests) {
        this.requests = requests;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Instant> contactTimes(UUID userId) {
        return userId == null ? List.of() : requests.findFirstRequestedAtByRequesterId(userId);
    }
}
