package com.draazy.api.deals.visit;

import java.util.UUID;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

// Existence probes across several contexts' tables, kept apart from their repositories.
interface OwnerRelationshipQueries extends Repository<Visit, UUID> {

    @Query("""
            select count(v) > 0 from Visit v
            where v.visitorId = :authorId and v.status = 'completed'
              and v.propertyId in (select p.id from Property p where p.owner.id = :ownerId)
            """)
    boolean completedVisit(@Param("authorId") UUID authorId, @Param("ownerId") UUID ownerId);

    @Query("""
            select count(o) > 0 from Offer o
            where o.fromUserId = :authorId and o.status = 'accepted'
              and o.propertyId in (select p.id from Property p where p.owner.id = :ownerId)
            """)
    boolean acceptedOffer(@Param("authorId") UUID authorId, @Param("ownerId") UUID ownerId);

    @Query("""
            select count(d) > 0 from Deal d
            where d.counterpartyId = :authorId and d.status = 'closed'
              and d.propertyId in (select p.id from Property p where p.owner.id = :ownerId)
            """)
    boolean closedDeal(@Param("authorId") UUID authorId, @Param("ownerId") UUID ownerId);

    @Query("""
            select count(f) > 0 from FinalizationRequest f
            where (f.initiatorId = :authorId or f.counterpartyId = :authorId)
              and f.status = 'accepted'
              and f.propertyId in (select p.id from Property p where p.owner.id = :ownerId)
            """)
    boolean acceptedFinalization(@Param("authorId") UUID authorId, @Param("ownerId") UUID ownerId);

    @Query("""
            select count(d) > 0 from TenancyDeclaration d
            where d.declarantId = :authorId and d.ownerId = :ownerId and d.status = 'confirmed'
            """)
    boolean confirmedDeclaration(@Param("authorId") UUID authorId, @Param("ownerId") UUID ownerId);
}
