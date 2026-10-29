package com.draazy.api.engagement.notification;

import java.time.Instant;
import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {
    @Query("select n from Notification n where n.userId = :userId "
            + "and (n.deliverAfter is null or n.deliverAfter <= :now) "
            + "and (n.read = false or n.createdAt >= :readCutoff) "
            + "and (:read is null or n.read = :read)")
    Page<Notification> findDeliverable(@Param("userId") UUID userId, @Param("read") Boolean read,
            @Param("now") Instant now, @Param("readCutoff") Instant readCutoff, Pageable pageable);

    @Query("select count(n) from Notification n where n.userId = :userId and n.read = false "
            + "and (n.deliverAfter is null or n.deliverAfter <= :now)")
    long countUnreadDeliverable(@Param("userId") UUID userId, @Param("now") Instant now);

    Optional<Notification> findByIdAndUserId(UUID id, UUID userId);

    @Modifying
    @Query("update Notification n set n.read = true where n.userId = :userId and n.id in :ids "
            + "and (n.deliverAfter is null or n.deliverAfter <= :now)")
    int markRead(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids,
            @Param("now") Instant now);

    @Modifying
    @Query("update Notification n set n.read = true where n.userId = :userId and n.read = false "
            + "and (n.deliverAfter is null or n.deliverAfter <= :now)")
    int markAllRead(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("update Notification n set n.read = true "
            + "where n.userId = :userId and n.type = :type and n.link = :link and n.read = false")
    int markReadByTypeAndLink(@Param("userId") UUID userId, @Param("type") String type,
            @Param("link") String link);

    @Modifying
    @Query("update Notification n set n.deliverAfter = null "
            + "where n.userId = :userId and n.deliverAfter is not null")
    int releaseDeferred(@Param("userId") UUID userId);

    @Modifying
    @Query("delete from Notification n where n.createdAt < :cutoff")
    int deleteCreatedBefore(@Param("cutoff") Instant cutoff);

    @Modifying
    @Query("delete from Notification n where n.read = true and n.createdAt < :cutoff")
    int deleteReadCreatedBefore(@Param("cutoff") Instant cutoff);

    @Modifying
    @Query("delete from Notification n where n.userId = :userId and n.id in :ids")
    int deleteMine(@Param("userId") UUID userId, @Param("ids") Collection<UUID> ids);
}
