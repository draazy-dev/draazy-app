package com.draazy.api.billing.referral;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReferralInviteRepository extends JpaRepository<ReferralInvite, UUID> {
    long countByReferrerIdAndCreatedAtAfter(UUID referrerId, Instant since);

    boolean existsByMobileAndCreatedAtAfter(String mobile, Instant since);

    long countByReferrerId(UUID referrerId);

    @Modifying
    @Query("delete from ReferralInvite i where i.createdAt < :cutoff")
    int deleteOlderThan(@Param("cutoff") Instant cutoff);

    @Query("""
            select i.referrerId from ReferralInvite i
            where i.mobile = :mobile and i.createdAt > :since and i.delivery = 'sent'
            order by i.createdAt
            """)
    List<UUID> referrersSince(@Param("mobile") String mobile, @Param("since") Instant since, Pageable first);
}
