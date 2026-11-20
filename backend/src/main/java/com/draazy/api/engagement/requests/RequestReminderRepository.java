package com.draazy.api.engagement.requests;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RequestReminderRepository extends JpaRepository<RequestReminder, UUID> {

    interface Tally {

        String getKind();

        UUID getRefId();

        long getTotal();

        Instant getLastAt();
    }

    @Query("""
            select r.kind as kind, r.refId as refId, count(r) as total, max(r.sentAt) as lastAt
            from RequestReminder r where r.refId in :refIds group by r.kind, r.refId""")
    List<Tally> tallyFor(@Param("refIds") Collection<UUID> refIds);

    long countByKindAndRefId(String kind, UUID refId);

    @Query("select max(r.sentAt) from RequestReminder r where r.kind = :kind and r.refId = :refId")
    Instant lastSentAt(@Param("kind") String kind, @Param("refId") UUID refId);

    boolean existsByRecipientIdAndNotifiedTrueAndSentAtAfter(UUID recipientId, Instant since);
}
