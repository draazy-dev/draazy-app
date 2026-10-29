package com.draazy.api.billing.referral;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralRepository extends JpaRepository<Referral, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select r from Referral r where r.id = :id")
    Optional<Referral> findForDecision(@Param("id") UUID id);

    @Query("""
            select r from Referral r
            where (:anyStatus = true or r.status in :statuses)
              and (:risk is null or r.risk = :risk)
              and r.at >= :since
              and (:q is null
                   or lower(r.referred) like :q escape '\\'
                   or r.referrerMobile like :q escape '\\'
                   or r.referredMobile like :q escape '\\'
                   or lower(cast(r.id as string)) like :q escape '\\'
                   or r.referrerId in (select u.id from User u where lower(u.name) like :q escape '\\'))
            order by r.at desc
            """)
    Page<Referral> queue(@Param("anyStatus") boolean anyStatus, @Param("statuses") List<String> statuses,
            @Param("risk") String risk, @Param("q") String q, @Param("since") Instant since, Pageable pageable);

    @Query("""
            select count(r),
                   coalesce(sum(case when r.status = 'pending' then 1 else 0 end), 0),
                   coalesce(sum(case when r.status = 'held' then 1 else 0 end), 0),
                   coalesce(sum(case when r.risk = 'high' then 1 else 0 end), 0),
                   coalesce(sum(case when r.status in ('qualified', 'rewarded') then 1 else 0 end), 0),
                   coalesce(sum(case when r.status in ('rejected', 'clawed-back') then 1 else 0 end), 0)
            from Referral r
            """)
    List<Object[]> tabCounts();

    List<Referral> findByReferrerId(UUID referrerId);

    boolean existsByReferredMobile(String referredMobile);

    long countByReferrerIdAndAtAfter(UUID referrerId, Instant since);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from Referral r
            where r.status = 'pending'
              and r.referredMobile = (select u.mobile from User u where u.id = :userId)
            """)
    Optional<Referral> findPendingForQualification(@Param("userId") UUID userId);

    @Query("""
            select count(r) from Referral r
            where r.referrerId = :referrerId
              and r.status in ('qualified', 'rewarded', 'held')
              and r.qualifiedAt >= :from and r.qualifiedAt < :to
            """)
    long countCappedBetween(@Param("referrerId") UUID referrerId, @Param("from") Instant from,
            @Param("to") Instant to);

    @Query("""
            select coalesce(sum(case when r.track = 'owner' then 1 else 0 end), 0),
                   coalesce(sum(case when r.track is null or r.track = 'seeker' then 1 else 0 end), 0)
            from Referral r
            where r.referrerId = :referrerId and r.status in ('qualified', 'rewarded')
            """)
    List<Object[]> grantedByTrack(@Param("referrerId") UUID referrerId);

    @Query("""
            select count(r) > 0 from Referral r
            where r.status in ('pending', 'qualified', 'held', 'rewarded')
              and (r.track is null or r.track = 'seeker')
              and r.referredMobile = (select u.mobile from User u where u.id = :userId)
            """)
    boolean friendContactBonusStands(@Param("userId") UUID userId);

    @Query("""
            select r from Referral r
            where r.referredMobile = (select u.mobile from User u where u.id = :userId)
            """)
    Optional<Referral> findByReferee(@Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from Referral r
            where r.status in ('qualified', 'rewarded', 'held')
              and r.referredMobile = (select u.mobile from User u where u.id = :userId)
            """)
    Optional<Referral> findLiveForReferee(@Param("userId") UUID userId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("""
            select r from Referral r
            where r.status in ('qualified', 'rewarded', 'held') and r.qualifiedPropertyId = :propertyId
            """)
    List<Referral> findLiveForProperty(@Param("propertyId") UUID propertyId);

    @Query("""
            select count(r) from Referral r, Property p
            where p.id = r.qualifiedPropertyId and p.owner.id = :ownerId
              and r.referrerId = :referrerId and r.id <> :id
              and r.track = 'seeker' and r.qualifiedAt > :since
            """)
    long countSeekerQualifiedByOwner(@Param("referrerId") UUID referrerId, @Param("ownerId") UUID ownerId,
            @Param("id") UUID id, @Param("since") Instant since);

    @Query("select r.id from Referral r where r.status = 'held' and r.holdUntil <= :now order by r.holdUntil")
    List<UUID> dueHeldIds(@Param("now") Instant now, Pageable limit);

    @Query("""
            select r.id from Referral r
            where r.status in ('qualified', 'rewarded') and r.grantedAt > :since order by r.grantedAt
            """)
    List<UUID> grantedSinceIds(@Param("since") Instant since);

    @Modifying
    @Query("""
            update Referral r
               set r.referredIpHash = null, r.referredDeviceHash = null, r.referredDeviceIdHash = null
             where r.at < :cutoff
               and (r.referredIpHash is not null or r.referredDeviceHash is not null
                    or r.referredDeviceIdHash is not null)
            """)
    int clearSignalsOlderThan(@Param("cutoff") Instant cutoff);
}
