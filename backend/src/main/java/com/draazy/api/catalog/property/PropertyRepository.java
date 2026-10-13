package com.draazy.api.catalog.property;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PropertyRepository
        extends JpaRepository<Property, UUID>, JpaSpecificationExecutor<Property>,
        PropertySearchFragment {

    @Override
    @EntityGraph(attributePaths = "owner")
    Optional<Property> findById(UUID id);

    @Override
    @EntityGraph(attributePaths = "owner")
    List<Property> findAllById(Iterable<UUID> ids);

    @EntityGraph(attributePaths = "owner")
    Optional<Property> findBySlug(String slug);

    boolean existsByIdAndArchivedFalseAndStatusIn(UUID id, Collection<String> statuses);

    /** Owner-scoped single fetch by id (returns empty for another owner's row → 404, never a leak). */
    @EntityGraph(attributePaths = "owner")
    Optional<Property> findByIdAndOwner_Id(UUID id, UUID ownerId);

    @EntityGraph(attributePaths = "owner")
    Optional<Property> findBySlugAndOwner_Id(String slug, UUID ownerId);

    /** Whether the listing was out of the live state at any point before {@code to}: a gap that opened at or after
     * {@code from}, or that was still open at {@code graceEnd}. */
    @Query(value = """
            select exists (select 1 from property_live_gaps g
                           where g.property_id = :propertyId and g.left_live_at < :to
                             and (g.left_live_at >= :from or g.returned_live_at is null
                                  or g.returned_live_at > :graceEnd))""", nativeQuery = true)
    boolean wasNotLiveBetween(@Param("propertyId") UUID propertyId, @Param("from") Instant from,
            @Param("graceEnd") Instant graceEnd, @Param("to") Instant to);

    /** Load a listing for an ops write against its verification state under a row lock (check-then-act).
     * Lock order: {@code properties} then {@code referrals}, never the reverse. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Property p where p.id = :id")
    Optional<Property> findForVerificationDecision(@Param("id") UUID id);

    @EntityGraph(attributePaths = "owner")
    Page<Property> findByOwner_Id(UUID ownerId, Pageable pageable);

    /** Just the ids of an owner's listings - the key set contacts needs, since {@code contact_requests}
     * has no {@code owner_id}. A projection: an index-only read against {@code idx_properties_owner}. */
    @Query("select p.id from Property p where p.owner.id = :ownerId")
    List<UUID> findIdsByOwnerId(@Param("ownerId") UUID ownerId);

    /** Listings by other owners that look like the same unit: two OR'd signals, each a plain
     * {@code =} so a null arm matches nothing. No society arm, no {@code ORDER BY}: data-model.md. */
    @Query("""
            select p from Property p
            where p.owner.id <> :ownerId
              and p.archived = false
              and p.status in :statuses
              and (
                    p.electricityMeterKey = :meter
                 or (p.addressKey = :addressKey and p.localitySlug = :localitySlug)
              )
            """)
    List<Property> findDuplicateCandidates(
            @Param("ownerId") UUID ownerId,
            @Param("statuses") Collection<String> statuses,
            @Param("meter") String meter,
            @Param("addressKey") String addressKey,
            @Param("localitySlug") String localitySlug,
            Pageable pageable);

    /** The same question turned around: this owner's own near-duplicates. Every clause matches
     * {@link #findDuplicateCandidates} except the owner comparison, and the two must not diverge. */
    @Query("""
            select p from Property p
            where p.owner.id = :ownerId
              and p.archived = false
              and p.status in :statuses
              and (
                    p.electricityMeterKey = :meter
                 or (p.addressKey = :addressKey and p.localitySlug = :localitySlug)
              )
            """)
    List<Property> findOwnDuplicateCandidates(
            @Param("ownerId") UUID ownerId,
            @Param("statuses") Collection<String> statuses,
            @Param("meter") String meter,
            @Param("addressKey") String addressKey,
            @Param("localitySlug") String localitySlug,
            Pageable pageable);

    /** Recently created listings carrying a duplicate signal - the catch-up sweep for siblings the
     * create-time probe could not see. Oldest first is load-bearing: data-model.md. */
    @Query("""
            select p from Property p
            where p.createdAt >= :since
              and p.archived = false
              and p.status in :statuses
              and (p.electricityMeterKey is not null
                or p.addressKey is not null
                or exists (select 1 from PropertyPhotoHash h where h.propertyId = p.id))
            order by p.createdAt asc
            """)
    List<Property> findRecentSignalCarrying(
            @Param("since") Instant since,
            @Param("statuses") Collection<String> statuses,
            Pageable pageable);

    /** Every listing carrying a duplicate signal - the ops desk's clustering read. A full page
     * must be treated as truncation, since clustering is pairwise: data-model.md. */
    @Query("""
            select p from Property p
            where p.archived = false
              and p.status in :statuses
              and (p.electricityMeterKey is not null
                or p.addressKey is not null
                or exists (select 1 from PropertyPhotoHash h where h.propertyId = p.id))
            order by p.createdAt desc
            """)
    List<Property> findSignalCarrying(
            @Param("statuses") Collection<String> statuses,
            Pageable pageable);

    /** Stamp {@code owner_verified} onto every listing an owner holds: the badge belongs to
     * the owner, not to a listing's lifecycle. {@code clearAutomatically} is load-bearing. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Property p set p.ownerVerified = true where p.owner.id = :ownerId and p.ownerVerified = false")
    int markOwnerVerified(@Param("ownerId") UUID ownerId);

    /** Withdraw the denormalised owner badge from every listing this owner holds - the exact mirror of
     * {@link #markOwnerVerified}, and diverging them would leave one direction subtly wrong. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Property p set p.ownerVerified = false where p.owner.id = :ownerId and p.ownerVerified = true")
    int markOwnerUnverified(@Param("ownerId") UUID ownerId);

    // Native on purpose: featured_days is not mapped, so an entity flush can never overwrite it.
    @Modifying(flushAutomatically = true)
    @Query(value = "update properties set featured_days = :days where id = :id", nativeQuery = true)
    int setFeaturedDays(@Param("id") UUID id, @Param("days") Integer days);

    /** Featured-first live listings for the homepage strip; the {@link Pageable} caps the result
     * because the contract endpoint takes no limit. Summary projection, so no owner graph. */
    List<Property> findByStatusAndArchivedFalseAndOwner_StatusNotOrderByFeaturedDescCreatedAtDesc(
            String status, String ownerStatus, Pageable limit);

    /** Live listings for one society, newest first — the {@code homes} array on the society hub.
     * Summary projection, so no owner graph and no contact data. */
    List<Property> findBySocietyIdAndStatusAndArchivedFalseOrderByCreatedAtDesc(
            UUID societyId, String status, Pageable limit);

    /** The same over a society and everything merged into it: a merge moves nothing, so the survivor's
     * hub finds those listings only by asking for the whole family (docs/flows/consumer/societies.md). */
    List<Property> findBySocietyIdInAndStatusAndArchivedFalseAndOwner_StatusNotOrderByCreatedAtDesc(
            Collection<UUID> societyIds, String status, String ownerStatus, Pageable limit);

    default long countVisibleMatching(PropertySearchQuery filters, ListingFacets facets,
            Instant baseline) {
        var match = PropertySpecs.publicSearch(filters, facets);
        if (baseline != null) {
            match = match.and((root, query, cb) ->
                    cb.greaterThan(root.get("createdAt"), baseline));
        }
        return count(match);
    }

    /** Live-listing counts grouped by locality slug. Computed, never {@code localities.listing_count},
     * which counts every property while every surface showing it means the live ones. */
    @Query("""
            select p.localitySlug, count(p)
            from Property p
            where p.status = :status and p.archived = false and p.localitySlug is not null
            group by p.localitySlug""")
    List<Object[]> countLiveByLocalitySlug(@Param("status") String status);

    /** One grouped pass over live listings: counts, then the flat samples behind the rent and rate
     * averages. Rows are [slug, live, rentFlats, avgRent, saleFlatsWithArea, avgRate, fromPrice]. */
    @Query(nativeQuery = true, value = """
            select p.locality_slug,
                   count(*),
                   count(*) filter (where p.deal = 'rent' and p.property_type_key = 'flat'),
                   avg(p.price) filter (where p.deal = 'rent' and p.property_type_key = 'flat'),
                   count(*) filter (where p.deal = 'buy' and p.property_type_key = 'flat'
                                      and p.area > 0 and coalesce(lower(p.area_unit), 'sqft') = 'sqft'),
                   avg(p.price / p.area) filter (where p.deal = 'buy' and p.property_type_key = 'flat'
                                      and p.area > 0 and coalesce(lower(p.area_unit), 'sqft') = 'sqft'),
                   min(p.price)
            from properties p
            where p.status = :status and p.archived = false and p.locality_slug is not null
              and (cast(:slug as text) is null or p.locality_slug = cast(:slug as text))
              and not exists (select 1 from users u where u.id = p.owner_id and u.status = 'suspended')
            group by p.locality_slug""")
    List<Object[]> liveLocalityStats(@Param("status") String status, @Param("slug") String slug);

    @Query("""
            select p.societyId, count(p)
            from Property p
            where p.status = :status and p.archived = false and p.societyId in :societyIds
              and p.owner.status <> 'suspended'
            group by p.societyId""")
    List<Object[]> countLiveBySocietyId(@Param("status") String status,
            @Param("societyIds") Collection<UUID> societyIds);

    /** Rows are [live, forSale, forRent, avgSaleRatePerArea, avgRent] over the given societies. */
    @Query(nativeQuery = true, value = """
            select count(*),
                   count(*) filter (where p.deal = 'buy'),
                   count(*) filter (where p.deal = 'rent'),
                   avg(p.price / p.area) filter (where p.deal = 'buy' and p.area > 0),
                   avg(p.price) filter (where p.deal = 'rent')
            from properties p
            where p.status = :status and p.archived = false and p.society_id in (:societyIds)
              and not exists (select 1 from users u where u.id = p.owner_id and u.status = 'suspended')""")
    List<Object[]> societyHomeStats(@Param("status") String status,
            @Param("societyIds") Collection<UUID> societyIds);

    @Query("""
            select lower(p.city), count(p)
            from Property p
            where p.status = :status and p.archived = false and p.owner.status <> 'suspended'
            group by lower(p.city)""")
    List<Object[]> countLiveByCity(@Param("status") String status);

    /** How many listings this owner currently has live. Counted, never {@code users.listings_count},
     * which tallies every row ever posted (docs/system/data-model.md). */
    long countByOwnerIdAndStatusAndArchivedFalse(UUID ownerId, String status);

    /** The listing-pass predicate for a row aliased {@code p}: an unexpired, entitling pass is bound to it. */
    String ACTIVE_PASS_SQL = """
            exists (select 1 from subscriptions s join plans pl on pl.id = s.plan_id
                    where s.property_id = p.id and pl.kind = 'listing-pass'
                      and s.status in ('active', 'past-due') and s.renews_at > :now)""";

    /** How many of this owner's live listings (see {@link PropertyStatus#OCCUPIES_LISTING_SLOT}) no
     * active listing pass covers, leaving out {@code excludeId}; the free tier's ceiling counts these. */
    @Query(nativeQuery = true, value = """
            select count(*) from properties p
            where p.owner_id = :ownerId and not p.archived and p.status in (:statuses)
              and p.id <> :excludeId
              and not\s""" + ACTIVE_PASS_SQL)
    long countLiveUncovered(@Param("ownerId") UUID ownerId,
            @Param("statuses") Collection<String> statuses, @Param("excludeId") UUID excludeId,
            @Param("now") Instant now);

    default long countLiveUncovered(UUID ownerId, Instant now) {
        return countLiveUncovered(ownerId, PropertyStatus.OCCUPIES_LISTING_SLOT, new UUID(0, 0), now);
    }

    /** The ids behind {@link #countLiveUncovered}, oldest listing first. */
    @Query(nativeQuery = true, value = """
            select p.id from properties p
            where p.owner_id = :ownerId and not p.archived and p.status in (:statuses)
              and not\s""" + ACTIVE_PASS_SQL + """

            order by p.created_at, p.id""")
    List<UUID> findLiveUncoveredIds(@Param("ownerId") UUID ownerId,
            @Param("statuses") Collection<String> statuses, @Param("now") Instant now);

    /** A pass covers a listing only while it is live; sold, rented and archived listings forfeit it, and
     * an order still waiting for payment is cancelled so its checkout cannot complete. */
    default void endListingPasses(UUID propertyId) {
        cancelUnpaidPassOrders(propertyId);
        expireListingPasses(propertyId);
    }

    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = """
            update subscriptions set status = 'expired', version = version + 1
            where property_id = :propertyId and status in ('active', 'past-due')
              and plan_id in (select id from plans where kind = 'listing-pass')""")
    int expireListingPasses(@Param("propertyId") UUID propertyId);

    @Modifying(flushAutomatically = true)
    @Query(nativeQuery = true, value = """
            update subscriptions set status = 'cancelled', idempotency_key = null, version = version + 1
            where property_id = :propertyId and status = 'pending'
              and plan_id in (select id from plans where kind = 'listing-pass')""")
    int cancelUnpaidPassOrders(@Param("propertyId") UUID propertyId);

    @Query(nativeQuery = true, value = """
            select exists (select 1 from properties p where p.id = :propertyId and\s""" + ACTIVE_PASS_SQL + ")")
    boolean hasActivePass(@Param("propertyId") UUID propertyId, @Param("now") Instant now);

    @Query("select count(p) from Property p where p.owner.id = :ownerId and p.createdAt > :since")
    long countPostedSince(@Param("ownerId") UUID ownerId, @Param("since") java.time.Instant since);

    /** The three homepage trust numbers in one statement so they cannot straddle a moderation write;
     * the ownership clause spells out the lapse rule and {@code verifiedOwners} counts people. */
    @Query("""
            select new com.draazy.api.catalog.property.TrustTally(
                count(p),
                count(case when p.ownerVerified = true
                             or (p.ownershipVerified = true
                                 and (p.ownershipVerifiedUntil is null
                                      or p.ownershipVerifiedUntil > :now))
                           then 1 end),
                count(distinct case when p.ownerVerified = true then p.owner.id end))
            from Property p
            where p.status = :status
              and p.archived = false
              and p.owner.status <> 'suspended'""")
    TrustTally tallyTrust(
            @Param("status") String status,
            @Param("now") Instant now);

    /** Count live listings matching a saved search's facets; the alert sweep and the saved-search list
     * share one query so the two readings cannot drift. {@code unbounded} drops the recency predicate. */
    @Query("""
            select count(p)
            from Property p
            where p.status = :status
              and p.archived = false
              and p.owner.status <> 'suspended'
              and (:unbounded = true
                   or (p.createdAt is not null and p.createdAt > :baseline))
              and (:deal is null or lower(p.deal) = :deal)
              and (:localitiesEmpty = true
                   or lower(coalesce(p.localitySlug, p.locality)) in :localities)
              and (:bhkEmpty = true or cast(p.bhk as integer) in :bhkValues)
            """)
    long countVisibleWithFilters(
            @Param("status") String status,
            @Param("unbounded") boolean unbounded,
            @Param("baseline") Instant baseline,
            @Param("deal") String deal,
            @Param("localitiesEmpty") boolean localitiesEmpty,
            @Param("localities") List<String> localities,
            @Param("bhkEmpty") boolean bhkEmpty,
            @Param("bhkValues") List<Integer> bhkValues);
}
