package com.draazy.api.catalog.property;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
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

    interface DealOf {
        UUID getId();

        String getDeal();
    }

    // Native so a deleted listing still reports its deal: a contact spent on it keeps drawing on the same pack.
    @Query(nativeQuery = true, value = "select id as id, lower(deal) as deal from properties where id in (:ids)")
    List<DealOf> findDealsByIdIn(@Param("ids") Collection<UUID> ids);

    @EntityGraph(attributePaths = "owner")
    Optional<Property> findByIdAndOwner_Id(UUID id, UUID ownerId);

    @EntityGraph(attributePaths = "owner")
    Optional<Property> findBySlugAndOwner_Id(String slug, UUID ownerId);

    @Query(value = """
            select exists (select 1 from property_live_gaps g
                           where g.property_id = :propertyId and g.left_live_at < :to
                             and (g.left_live_at >= :from or g.returned_live_at is null
                                  or g.returned_live_at > :graceEnd))""", nativeQuery = true)
    boolean wasNotLiveBetween(@Param("propertyId") UUID propertyId, @Param("from") Instant from,
            @Param("graceEnd") Instant graceEnd, @Param("to") Instant to);

    // Lock order is properties then referrals, never the reverse.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Property p where p.id = :id")
    Optional<Property> findForVerificationDecision(@Param("id") UUID id);

    @Query(nativeQuery = true, value = """
            select exists (
                select 1 from properties
                 where id <> :id and (cover_image = :url or floor_plan = :url
                       or images @> jsonb_build_array(cast(:url as text)))
                union all
                select 1 from flatmate_rooms where photos @> jsonb_build_array(cast(:url as text))
                union all
                select 1 from users where avatar = :url)""")
    boolean photoUsedElsewhere(@Param("id") UUID id, @Param("url") String url);

    default boolean photoShownAnywhere(String url) {
        return photoUsedElsewhere(new UUID(0L, 0L), url);
    }

    @Query(nativeQuery = true, value = """
            select case
                when exists (select 1 from properties where id = :id and deal_status = 'reserved') then 'deal'
                when exists (select 1 from offers where property_id = :id and status in ('pending', 'countered'))
                    then 'offer'
                when exists (select 1 from finalization_requests where property_id = :id and status = 'pending')
                    then 'finalization'
                when exists (select 1 from service_requests where property_id = :id
                             and status not in ('awaiting-payment', 'completed', 'cancelled'))
                    then 'service'
            end""")
    String openWorkBlockingDelete(@Param("id") UUID id);

    @Query("""
            select p from Property p
            where p.archived = true and p.purgeAfter <= :now and p.contentPurgedAt is null
            order by p.purgeAfter""")
    List<Property> findContentPurgeDue(@Param("now") Instant now, Limit limit);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Property p where p.id = :id and p.owner.id = :ownerId")
    Optional<Property> findOwnedForUpdate(@Param("id") UUID id, @Param("ownerId") UUID ownerId);

    @EntityGraph(attributePaths = "owner")
    Page<Property> findByOwner_Id(UUID ownerId, Pageable pageable);

    @Query("select p.id from Property p where p.owner.id = :ownerId")
    List<UUID> findIdsByOwnerId(@Param("ownerId") UUID ownerId);

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

    // clearAutomatically is load-bearing: stale managed entities would otherwise overwrite the stamp.
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Property p set p.ownerVerified = true where p.owner.id = :ownerId and p.ownerVerified = false")
    int markOwnerVerified(@Param("ownerId") UUID ownerId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update Property p set p.ownerVerified = false where p.owner.id = :ownerId and p.ownerVerified = true")
    int markOwnerUnverified(@Param("ownerId") UUID ownerId);

    @Modifying(flushAutomatically = true)
    @Query(value = "update properties set featured_days = :days where id = :id", nativeQuery = true)
    int setFeaturedDays(@Param("id") UUID id, @Param("days") Integer days);

    @Modifying
    @Query(value = """
            with seen as (
                insert into property_view_days (property_id, day, viewer_key)
                select p.id, cast(now() at time zone 'Asia/Kolkata' as date), :viewerKey
                  from properties p join users o on o.id = p.owner_id
                 where p.id = :id and p.status = 'approved' and not p.archived and o.status <> 'suspended'
                   and (cast(:viewerId as uuid) is null or p.owner_id <> cast(:viewerId as uuid))
                on conflict do nothing
                returning property_id)
            update properties set views = views + 1 where id in (select property_id from seen)""",
            nativeQuery = true)
    int countView(@Param("id") UUID id, @Param("viewerId") UUID viewerId, @Param("viewerKey") String viewerKey);

    @Modifying
    @Query(value = "update properties set enquiries = enquiries + 1 where id = :id", nativeQuery = true)
    int countEnquiry(@Param("id") UUID id);

    @Query("""
            select p from Property p
            where p.status = :status and p.archived = false and p.owner.status <> :ownerStatus
              and (p.demo = true or coalesce(p.lastConfirmedAt, p.createdAt) > :cutoff)
            order by p.featured desc, p.createdAt desc, p.id desc""")
    List<Property> featuredVisible(@Param("status") String status, @Param("ownerStatus") String ownerStatus,
            @Param("cutoff") Instant cutoff, Pageable limit);

    @Query("""
            select p from Property p
            where p.societyId in :societyIds and p.status = :status and p.archived = false
              and p.owner.status <> :ownerStatus
              and (p.demo = true or coalesce(p.lastConfirmedAt, p.createdAt) > :cutoff)
            order by p.createdAt desc, p.id desc""")
    List<Property> visibleSocietyHomes(@Param("societyIds") Collection<UUID> societyIds,
            @Param("status") String status, @Param("ownerStatus") String ownerStatus,
            @Param("cutoff") Instant cutoff, Pageable limit);

    default long countVisibleMatching(PropertySearchQuery filters, ListingFacets facets,
            Instant baseline) {
        var match = PropertySpecs.publicSearch(filters, facets);
        if (baseline != null) {
            match = match.and((root, query, cb) ->
                    cb.greaterThan(root.get("createdAt"), baseline));
        }
        return count(match);
    }

    @Query("""
            select p.localitySlug, count(p)
            from Property p
            where p.status = :status and p.archived = false and p.localitySlug is not null
            group by p.localitySlug""")
    List<Object[]> countLiveByLocalitySlug(@Param("status") String status);

    @Query(nativeQuery = true, value = """
            select p.locality_slug,
                   count(*),
                   count(*) filter (where p.deal = 'rent' and p.property_type_key = 'flat'),
                   avg(p.price) filter (where p.deal = 'rent' and p.property_type_key = 'flat'),
                   count(*) filter (where p.deal = 'buy' and p.property_type_key = 'flat'
                                      and p.area > 0 and coalesce(lower(p.area_unit), 'sqft') = 'sqft'),
                   avg(p.price / p.area) filter (where p.deal = 'buy' and p.property_type_key = 'flat'
                                      and p.area > 0 and coalesce(lower(p.area_unit), 'sqft') = 'sqft'),
                   min(p.price),
                   count(*) filter (where p.deal = 'buy'),
                   count(*) filter (where p.deal = 'rent'),
                   min(p.price) filter (where p.deal = 'buy'),
                   min(p.price) filter (where p.deal = 'rent')
            from properties p
            where p.status = :status and p.archived = false and p.locality_slug is not null
              and (cast(:slug as text) is null or p.locality_slug = cast(:slug as text))
              and not exists (select 1 from users u where u.id = p.owner_id and u.status = 'suspended')
              and (p.demo or coalesce(p.last_confirmed_at, p.created_at) > :cutoff)
            group by p.locality_slug""")
    List<Object[]> liveLocalityStats(@Param("status") String status, @Param("slug") String slug,
            @Param("cutoff") Instant cutoff);

    @Query("""
            select p.societyId, count(p)
            from Property p
            where p.status = :status and p.archived = false and p.societyId in :societyIds
              and p.owner.status <> 'suspended'
              and (p.demo = true or coalesce(p.lastConfirmedAt, p.createdAt) > :cutoff)
            group by p.societyId""")
    List<Object[]> countLiveBySocietyId(@Param("status") String status,
            @Param("societyIds") Collection<UUID> societyIds, @Param("cutoff") Instant cutoff);

    @Query(nativeQuery = true, value = """
            select count(*),
                   count(*) filter (where p.deal = 'buy'),
                   count(*) filter (where p.deal = 'rent'),
                   avg(p.price / p.area) filter (where p.deal = 'buy' and p.area > 0),
                   avg(p.price) filter (where p.deal = 'rent')
            from properties p
            where p.status = :status and p.archived = false and p.society_id in (:societyIds)
              and not exists (select 1 from users u where u.id = p.owner_id and u.status = 'suspended')
              and (p.demo or coalesce(p.last_confirmed_at, p.created_at) > :cutoff)""")
    List<Object[]> societyHomeStats(@Param("status") String status,
            @Param("societyIds") Collection<UUID> societyIds, @Param("cutoff") Instant cutoff);

    @Query("""
            select lower(p.city), count(p)
            from Property p
            where p.status = :status and p.archived = false and p.owner.status <> 'suspended'
              and (p.demo = true or coalesce(p.lastConfirmedAt, p.createdAt) > :cutoff)
            group by lower(p.city)""")
    List<Object[]> countLiveByCity(@Param("status") String status, @Param("cutoff") Instant cutoff);

    long countByOwnerIdAndStatusAndArchivedFalse(UUID ownerId, String status);

    @Query("""
            select count(p) from Property p
            where p.owner.id = :ownerId and p.status = :status and p.archived = false
              and p.owner.status <> 'suspended'
              and (p.demo = true or coalesce(p.lastConfirmedAt, p.createdAt) > :cutoff)""")
    long countPublicByOwner(@Param("ownerId") UUID ownerId, @Param("status") String status,
            @Param("cutoff") Instant cutoff);

    String ACTIVE_PASS_SQL = """
            exists (select 1 from subscriptions s join plans pl on pl.id = s.plan_id
                    where s.property_id = p.id and pl.kind = 'listing-pass'
                      and s.status in ('active', 'past-due') and s.renews_at > :now)""";

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

    @Query(nativeQuery = true, value = """
            select p.id from properties p
            where p.owner_id = :ownerId and not p.archived and p.status in (:statuses)
              and not\s""" + ACTIVE_PASS_SQL + """

            order by p.created_at, p.id""")
    List<UUID> findLiveUncoveredIds(@Param("ownerId") UUID ownerId,
            @Param("statuses") Collection<String> statuses, @Param("now") Instant now);

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

    @Query(nativeQuery = true, value = """
            select exists (select 1 from contact_requests c where c.property_id = :propertyId)
                or exists (select 1 from subscriptions s join plans pl on pl.id = s.plan_id
                           where s.property_id = :propertyId and pl.kind = 'listing-pass'
                             and s.status in ('pending', 'active', 'past-due'))""")
    boolean hasDealPricedActivity(@Param("propertyId") UUID propertyId);

    @Query("select p.createdAt from Property p where p.owner.id = :ownerId and p.createdAt > :since"
            + " order by p.createdAt asc")
    List<Instant> postedTimesSince(@Param("ownerId") UUID ownerId, @Param("since") Instant since);

    @Query("select p from Property p where p.owner.id = :ownerId and p.archived = false and p.createdAt > :since"
            + " order by p.createdAt desc")
    List<Property> recentlyPostedBy(@Param("ownerId") UUID ownerId, @Param("since") Instant since);

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
              and p.owner.status <> 'suspended'
              and (p.demo = true or coalesce(p.lastConfirmedAt, p.createdAt) > :cutoff)""")
    TrustTally tallyTrust(
            @Param("status") String status,
            @Param("now") Instant now, @Param("cutoff") Instant cutoff);
}
