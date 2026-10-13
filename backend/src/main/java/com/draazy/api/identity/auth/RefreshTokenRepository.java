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
    // Rationale: docs/flows/consumer/auth.md, "Backend: refresh rotation".
    @Query(value = "SELECT pg_advisory_xact_lock(:key)", nativeQuery = true)
    void lockFamily(@Param("key") long key);

    // FOR UPDATE: two concurrent refreshes of one token would otherwise both mint a successor.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    // Unlocked, only to choose the family lock before any row lock; user_id never changes, so it cannot go stale.
    @Query("select t.userId from RefreshToken t where t.tokenHash = :tokenHash")
    Optional<UUID> findUserIdByTokenHash(@Param("tokenHash") String tokenHash);

    // Locked so a sibling's concurrent rotation cannot commit a token the burn never saw.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    List<RefreshToken> findByUserId(UUID userId);

    // Read by the bearer filter through RoleSource: access tokens issued before this are refused.
    @Modifying
    @Query(value = "UPDATE users SET sessions_revoked_at = :at WHERE id = :userId", nativeQuery = true)
    void stampSessionsRevoked(@Param("userId") UUID userId, @Param("at") Instant at);

    // The successor in a rotation chain, locked because the grace path rotates it. A second row is a bug and throws.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    Optional<RefreshToken> findByRotatedFrom(UUID predecessorId);

    @Modifying
    @Query(value = "DELETE FROM refresh_tokens WHERE expires_at < :cutoff", nativeQuery = true)
    int deleteExpiredBefore(@Param("cutoff") Instant cutoff);
}
