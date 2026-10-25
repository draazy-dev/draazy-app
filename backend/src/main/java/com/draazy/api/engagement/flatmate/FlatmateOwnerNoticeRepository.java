package com.draazy.api.engagement.flatmate;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface FlatmateOwnerNoticeRepository extends JpaRepository<FlatmateOwnerNotice, UUID> {

    Optional<FlatmateOwnerNotice> findByTokenHash(String tokenHash);

    /** Locked so two taps of the link racing each other cannot record both answers. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<FlatmateOwnerNotice> findLockedByTokenHash(String tokenHash);

    boolean existsByRoomIdAndOwnerMobileAndAddressFingerprint(
            UUID roomId, String ownerMobile, String addressFingerprint);

    long countByHostIdAndCreatedAtAfter(UUID hostId, Instant since);

    long countByOwnerMobileAndCreatedAtAfter(String ownerMobile, Instant since);

    @Modifying
    @Query("delete from FlatmateOwnerNotice n where n.expiresAt < :now")
    int deleteExpired(@Param("now") Instant now);

    @Modifying(flushAutomatically = true)
    @Query("delete from FlatmateOwnerNotice n where n.hostId = :hostId or n.ownerMobile = :mobile")
    int deleteForErasedAccount(@Param("hostId") UUID hostId, @Param("mobile") String mobile);
}