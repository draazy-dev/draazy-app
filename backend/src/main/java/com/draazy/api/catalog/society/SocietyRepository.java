package com.draazy.api.catalog.society;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SocietyRepository
        extends JpaRepository<Society, UUID>, JpaSpecificationExecutor<Society> {
    Optional<Society> findBySlug(String slug);

    @Query("""
            select s.id from Society s
            where s.id = :id or s.mergedInto = :id
               or s.id = (select m.mergedInto from Society m where m.id = :id)
               or s.mergedInto = (select m.mergedInto from Society m where m.id = :id)""")
    List<UUID> familyIds(@Param("id") UUID id);

    Optional<Society> findBySlugAndArchivedAtIsNull(String slug);

    Optional<Society> findByPlaceId(String placeId);

    @Query("""
            select s from Society s
            where s.archivedAt is null and s.mergedInto is null
              and s.lat between :minLat and :maxLat and s.lng between :minLng and :maxLng""")
    List<Society> withinBox(@Param("minLat") double minLat, @Param("maxLat") double maxLat,
            @Param("minLng") double minLng, @Param("maxLng") double maxLng);

    @Query(value = """
            with base as (
                select s.id from societies s
                where s.merged_into is null and s.archived_at is null
                  and (cast(:locality as text) is null or s.locality_slug = cast(:locality as text))
                  and (not :mapped or s.place_id is not null)
                  and (cast(:like as text) is null or lower(s.name || ' ' || coalesce(s.builder, '')
                       || ' ' || replace(coalesce(s.locality_slug, ''), '-', ' ')) like cast(:like as text))
            ), fam as (
                select b.id as sid, b.id as fid from base b
                union all
                select b.id, f.id from base b join societies f on f.merged_into = b.id
            ), homes as (
                select fam.sid, count(*) as n
                from fam join properties p on p.society_id = fam.fid
                where p.status = 'approved' and p.archived = false
                  and not exists (select 1 from users u where u.id = p.owner_id and u.status = 'suspended')
                  and (p.demo or coalesce(p.last_confirmed_at, p.created_at) > :cutoff)
                group by fam.sid
            ), rated as (
                select fam.sid, sum(r.avg_rating * r.cnt) as weighted, sum(r.cnt) as cnt
                from fam join (
                    select target_id, round(avg(rating), 1) as avg_rating, count(*) as cnt
                    from reviews
                    where target_type = 'society' and status = 'published'
                      and target_id in (select cast(fid as text) from fam)
                    group by target_id
                ) r on r.target_id = cast(fam.fid as text)
                group by fam.sid
            )
            select s.id, count(*) over () as total
            from base b
            join societies s on s.id = b.id
            left join homes h on h.sid = b.id
            left join rated r on r.sid = b.id
            where (not :hasListings or coalesce(h.n, 0) > 0)
            order by
                case cast(:mode as text)
                    when 'homes' then cast(coalesce(h.n, 0) as numeric)
                    when 'rating' then coalesce(round(r.weighted / r.cnt, 2), 0)
                    else least(coalesce(h.n, 0), 3) + coalesce(round(r.weighted / r.cnt, 2), 0) / 5
                end desc,
                case when cast(:mode as text) = 'rating' then coalesce(r.cnt, 0) else 0 end desc,
                lower(s.name), s.slug
            limit :limit offset :offset""", nativeQuery = true)
    List<Object[]> rankedIds(@Param("like") String like, @Param("locality") String locality,
            @Param("hasListings") boolean hasListings, @Param("mapped") boolean mapped, @Param("mode") String mode,
            @Param("limit") int limit, @Param("offset") long offset, @Param("cutoff") Instant cutoff);

    @Query("select s from Society s where s.source = 'community' and s.mergedInto is null"
            + " and s.archivedAt is null"
            + " and lower(concat(s.name, ' ', replace(coalesce(s.localitySlug, ''), '-', ' '))) like :like escape '\\'"
            + " order by s.createdAt desc")
    org.springframework.data.domain.Page<Society> candidates(@Param("like") String like,
            org.springframework.data.domain.Pageable pageable);

    @Query("""
            select s.slug, s.name, s.localitySlug, s.lat, s.lng
            from Society s
            where s.mergedInto is null and s.archivedAt is null""")
    List<Object[]> duplicateScan();

    List<Society> findBySlugIn(Collection<String> slugs);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            update societies set
                registration = coalesce(cast(:registration as boolean), registration),
                conveyance = coalesce(cast(:conveyance as boolean), conveyance),
                maintenance_per_sqft = coalesce(cast(:maintenance as numeric), maintenance_per_sqft),
                admin_note = case when cast(:noteGiven as boolean)
                                  then cast(:adminNote as text) else admin_note end,
                updated_at = now()
            where id = :societyId""", nativeQuery = true)
    int applyAdminEdit(@Param("societyId") UUID societyId,
            @Param("registration") Boolean registration,
            @Param("conveyance") Boolean conveyance,
            @Param("maintenance") java.math.BigDecimal maintenance,
            @Param("noteGiven") boolean noteGiven,
            @Param("adminNote") String adminNote);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            insert into societies
                (id, slug, name, place_id, locality_slug, lat, lng, registration, conveyance,
                 amenities, source, mint_origin, created_by, created_at, updated_at, district, district_checked_at)
            values
                (gen_random_uuid(), :slug, :name, :placeId, cast(:localitySlug as text),
                 cast(:lat as double precision), cast(:lng as double precision),
                 false, false, '[]'::jsonb, 'community', cast(:mintOrigin as text),
                 :createdBy, now(), now(), cast(:district as text), now())
            on conflict do nothing""", nativeQuery = true)
    int mintCommunity(@Param("slug") String slug,
            @Param("name") String name,
            @Param("placeId") String placeId,
            @Param("localitySlug") String localitySlug,
            @Param("lat") Double lat,
            @Param("lng") Double lng,
            @Param("mintOrigin") String mintOrigin,
            @Param("createdBy") UUID createdBy,
            @Param("district") String district);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            update societies set
                merged_into = :survivorId,
                merged_at = now(),
                merged_by = :operatorId,
                updated_at = now()
            where id = :societyId and merged_into is null""", nativeQuery = true)
    int recordMerge(@Param("societyId") UUID societyId,
            @Param("survivorId") UUID survivorId,
            @Param("operatorId") UUID operatorId);

    @org.springframework.data.jpa.repository.Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            update societies set
                merged_into = null,
                merged_at = null,
                merged_by = null,
                updated_at = now()
            where id = :societyId and merged_into is not null""", nativeQuery = true)
    int undoMerge(@Param("societyId") UUID societyId);

    @Query(value = """
            select merged_into, id
            from societies
            where merged_into in (:survivorIds)""", nativeQuery = true)
    List<Object[]> findMergedInto(@Param("survivorIds") Collection<UUID> survivorIds);

    @Query("select s from Society s where s.mergedInto is not null order by s.mergedAt desc")
    org.springframework.data.domain.Page<Society> merged(org.springframework.data.domain.Pageable pageable);

    List<Society> findByMergedIntoOrderByMergedAtDesc(UUID survivorId);

    @Query("select count(s) from Society s where s.source = 'community' and s.mergedInto is null"
            + " and s.archivedAt is null")
    long countCandidates();
}
