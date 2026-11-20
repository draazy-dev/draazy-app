package com.draazy.api.identity.auth;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface OtpCodeRepository extends JpaRepository<OtpCode, UUID> {
    // Row-locked so concurrent verifies cannot share one read of attempts and slip past the
    // brute-force ceiling.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<OtpCode> findFirstByMobileAndPurposeAndConsumedFalseOrderByCreatedAtDesc(
            String mobile, String purpose);

    @Query("select c.createdAt from OtpCode c where c.mobile = :mobile"
            + " and (c.purpose = :family or c.purpose like concat(:family, ':%'))"
            + " order by c.createdAt desc")
    List<Instant> findRecentSendTimesForRecipient(@Param("mobile") String mobile,

            @Param("family") String family, Pageable pageable);
    @Query("select c.createdAt from OtpCode c where c.createdAt >= :since order by c.createdAt")
    List<Instant> findSendTimesSince(@Param("since") Instant since, Pageable pageable);

    @Query("select c.createdAt from OtpCode c"
            + " where (c.purpose = :family or c.purpose like concat(:family, ':%'))"
            + " and c.createdAt >= :since order by c.createdAt")
    List<Instant> findSendTimesForPurposeSince(@Param("family") String family,
            @Param("since") Instant since, Pageable pageable);
    @Query("select c.createdAt from OtpCode c where c.requestedBy = :requestedBy"
            + " and (c.purpose = :family or c.purpose like concat(:family, ':%'))"
            + " and c.createdAt >= :since order by c.createdAt")
    List<Instant> findSendTimesForCallerSince(@Param("requestedBy") UUID requestedBy,
            @Param("family") String family, @Param("since") Instant since, Pageable pageable);
}
