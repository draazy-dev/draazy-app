package com.draazy.api.identity.user;

import com.draazy.api.security.RoleSource;
import java.time.Instant;
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

public interface UserRepository extends JpaRepository<User, UUID>, RoleSource {
    Optional<User> findByMobile(String mobile);

    Optional<User> findByMobileAndArchivedFalse(String mobile);

    List<User> findAllByMobileIn(Collection<String> mobiles);

    Optional<User> findByEmailIgnoreCaseAndArchivedFalse(String email);

    Optional<User> findByIdAndArchivedFalse(UUID id);

    boolean existsByMobile(String mobile);

    boolean existsByEmailIgnoreCaseAndArchivedFalse(String email);

    @Query("""
            select count(u) > 0 from User u
            where u.archived = false
              and u.id <> :excluding
              and lower(u.email) = lower(:email)
            """)
    boolean existsOtherLiveWithEmailIgnoreCase(@Param("email") String email,
            @Param("excluding") UUID excluding);

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

    @Modifying(flushAutomatically = true)
    @Query("update User u set u.gender = :gender where u.id = :id and u.gender is null")
    int claimGenderIfUnset(@Param("id") UUID id, @Param("gender") String gender);

    @Query("select u.gender from User u where u.id = :id")
    String genderOf(@Param("id") UUID id);

    default String claimGender(UUID id, String gender) {
        return claimGenderIfUnset(id, gender) == 1 ? gender : genderOf(id);
    }

    // One statement so two concurrent saves cannot both spend the last change.
    @Modifying(flushAutomatically = true)
    @Query("""
            update User u set u.gender = :gender, u.genderChanges = u.genderChanges + 1
            where u.id = :id and u.gender is not null and u.gender <> :gender
              and u.verified = false and u.genderChanges < :limit""")
    int changeGender(@Param("id") UUID id, @Param("gender") String gender, @Param("limit") int limit);

    @Query("select u from User u where u.role = :role and u.archived = false")
    List<User> findLiveByRole(@Param("role") String role);

    @Query("select u from User u where u.role in ('admin', 'manager', 'staff') order by u.createdAt desc")
    List<User> findBackOfficeAccounts();

    @Query("""
            select u.email from User u
            where u.id = :id and u.role = 'staff' and u.archived = false
              and u.status = 'active' and u.email is not null and trim(u.email) <> ''""")
    Optional<String> findLiveStaffEmail(@Param("id") UUID id);

    @Query("""
            select u from User u
            where u.archived = :archived
              and (:role is null or u.role = :role)
              and (:customers = false or u.role in ('owner', 'buyer'))
              and (:status is null or u.status = :status)
              and (:flagged is null or u.flagged = :flagged)
              and u.createdAt >= :since
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
            @Param("since") Instant since,
            Pageable pageable);

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
