package com.draazy.api.deals.visit;

import com.draazy.api.common.trust.OwnerRelationship;
import com.draazy.api.finance.tenancy.TenancyRepository;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.leads.contact.ContactRequestStatuses;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

// Lives in deals because it is the one context that ranks above leads, finance and catalog.
@Service
class OwnerRelationshipService implements OwnerRelationship {

    private final OwnerRelationshipQueries queries;
    private final ContactRequestRepository contactRequests;
    private final TenancyRepository tenancies;

    OwnerRelationshipService(OwnerRelationshipQueries queries, ContactRequestRepository contactRequests,
            TenancyRepository tenancies) {
        this.queries = queries;
        this.contactRequests = contactRequests;
        this.tenancies = tenancies;
    }

    @Override
    @Transactional(readOnly = true)
    public boolean exists(UUID authorId, UUID ownerId) {
        if (authorId == null || ownerId == null) {
            return false;
        }
        return contactRequests.existsApprovedForOwner(authorId, ownerId, ContactRequestStatuses.APPROVED)
                || queries.completedVisit(authorId, ownerId)
                || queries.acceptedOffer(authorId, ownerId)
                || queries.closedDeal(authorId, ownerId)
                || queries.acceptedFinalization(authorId, ownerId)
                || tenancies.existsConfirmedByTenantIdAndOwnerId(authorId, ownerId)
                || queries.confirmedDeclaration(authorId, ownerId);
    }
}
