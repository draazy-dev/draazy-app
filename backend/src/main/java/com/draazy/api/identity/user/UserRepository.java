package com.draazy.api.identity.user;

import com.draazy.api.security.RoleSource;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

// Users are never hard-deleted; live lookups must filter archived = false.
public interface UserRepository extends JpaRepository<User, UUID>, RoleSource {

    Optional<User> findByMobile(String mobile);

    Optional<User> findByMobileAndArchivedFalse(String mobile);

    // Batch form avoids resolving a page of mobiles one at a time.
    List<User> findAllByMobileIn(Collection<String> mobiles);

    // The staff sign-in lookup, deliberately case-insensitive. It has to be, because the write side is.
    Optional<User> findByEmailIgnoreCaseAndArchivedFalse(String email);

    Optional<User> findByIdAndArchivedFalse(UUID id);

    boolean existsByMobile(String mobile);

    // Case-insensitive because the partial unique index is on lower(email); a guard that disagrees
    // only changes which conflict the operator sees.
    boolean existsByEmailIgnoreCaseAndArchivedFalse(String email);

    // Excludes the row being restored: archived accounts already exist, so a repeat restore would
    // otherwise find itself and be refused.
    @Query("""
            select count(u) > 0 from User u
            where u.archived = false
              and u.id <> :excluding
              and lower(u.email) = lower(:email)
            """)
    boolean existsOtherLiveWithEmailIgnoreCase(@Param("email") String email,
            @Param("excluding") UUID excluding);

    // Scalar projection because the bearer-token filter needs only these columns.
    @Override
    @Query("""
            select u.role as role, u.sessionsRevokedAt as sessionsRevokedAt,
                   case when u.archived = true or u.status <> 'active' then true else false end as blocked
            from User u where u.id = :id""")
    Optional<RoleSource.Standing> standingOf(@Param("id") UUID id);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update User u set u.lastActive = :now
            where u.id = :id and (u.lastActive is null or u.lastActive < :cutoff)
            """)
    int touchLastActive(@Param("id") UUID id, @Param("now") java.time.Instant now,
            @Param("cutoff") java.time.Instant cutoff);

    // No clearAutomatically: callers hold locked room/group entities that must stay managed.
    @Modifying(flushAutomatically = true)
    @Query("update User u set u.gender = :gender where u.id = :id and u.gender is null")
    int claimGenderIfUnset(@Param("id") UUID id, @Param("gender") String gender);

    // A scalar read, so a first-level-cached entity cannot answer with a stale value.
    @Query("select u.gender from User u where u.id = :id")
    String genderOf(@Param("id") UUID id);

    /** Saves the gender when none is on file; either way returns the value now stored. */
    default String claimGender(UUID id, String gender) {
        return claimGenderIfUnset(id, gender) == 1 ? gender : genderOf(id);
    }

    // Unpaged on purpose: used only by the last-administrator floor.
    @Query("select u from User u where u.role = :role and u.archived = false")
    List<User> findLiveByRole(@Param("role") String role);

    // Unpaged on purpose: every admin, manager and staff account, live and archived, is one roster.
    @Query("select u from User u where u.role in ('admin', 'manager', 'staff') order by u.createdAt desc")
    List<User> findBackOfficeAccounts();

    // Names match by prefix; a mobile only as the whole number, since rows mask it and a prefix would
    // unmask it digit by digit.
    @Query("""
            select u from User u
            where u.archived = :archived
              and (:role is null or u.role = :role)
              and (:customers = false or u.role in ('owner', 'buyer'))
              and (:status is null or u.status = :status)
              and (:flagged is null or u.flagged = :flagged)
              and (:prefix is null
                   or lower(u.name) like :prefix escape '\\'
                   or u.mobile = :mobile)
            order by u.createdAt desc
            """)
    Page<User> searchForAdmin(@Param("role") String role,
            @Param("customers") boolean customers,
            @Param("prefix") String prefix,
            @Param("mobile") String mobile,
            @Param("status") String status,
            @Param("flagged") Boolean flagged,
            @Param("archived") boolean archived,
            Pageable pageable);

    // Same predicates as searchForAdmin minus archived/status/flagged, so the tab counts group over one scan.
    @Query("""
            select u.archived, u.status, count(u) from User u
            where (:role is null or u.role = :role)
              and (:customers = false or u.role in ('owner', 'buyer'))
              and (:prefix is null
                   or lower(u.name) like :prefix escape '\\'
                   or u.mobile = :mobile)
            group by u.archived, u.status
            """)
    List<Object[]> countByStanding(@Param("role") String role,
            @Param("customers") boolean customers, @Param("prefix") String prefix,
            @Param("mobile") String mobile);
}
