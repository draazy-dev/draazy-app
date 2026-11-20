package com.draazy.api.identity.auth;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {
    // One per-user lock taken before any row lock, so concurrent family operations cannot deadlock.
    @Query(value = "SELECT pg_advisory_xact_lock(:key)", nativeQuery = true)
    void lockFamily(@Param("key") long key);

    // FOR UPDATE: two concurrent refreshes of one token would otherwise both mint a successor.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Query("select t.userId from RefreshToken t where t.tokenHash = :tokenHash")
    Optional<UUID> findUserIdByTokenHash(@Param("tokenHash") String tokenHash);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<RefreshToken> findByUserId(UUID userId);

    @Modifying
    @Query(value = "UPDATE users SET sessions_revoked_at = :at WHERE id = :userId", nativeQuery = true)
    void stampSessionsRevoked(@Param("userId") UUID userId, @Param("at") Instant at);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RefreshToken> findByRotatedFrom(UUID predecessorId);

    @Modifying
    @Query(value = "DELETE FROM refresh_tokens WHERE expires_at < :cutoff", nativeQuery = true)
    int deleteExpiredBefore(@Param("cutoff") Instant cutoff);
}
