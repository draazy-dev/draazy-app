package com.draazy.api.services.support;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** The caller's own tickets, and the paged platform-wide queue ops triages. */
public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {

    /** The caller's own tickets. Serves {@code idx_support_tickets_user_created} (V22). */
    List<SupportTicket> findByUserIdOrderByCreatedAtDesc(UUID userId);

    /** Newest-first platform queue, optionally only the awaiting-reply ({@code staffUnread}) or the answered side,
     * and only tickets raised since {@code since}; served by {@code idx_support_tickets_created} (V53). */
    @Query("""
            select t from SupportTicket t
            where (:anyReply = true or t.staffUnread = :awaiting)
              and t.createdAt >= :since
            order by t.createdAt desc
            """)
    Page<SupportTicket> findQueue(@Param("anyReply") boolean anyReply, @Param("awaiting") boolean awaiting,
            @Param("since") Instant since, Pageable pageable);
    // One grouped COUNT for the queue's three tab totals; the partial index serves the true side.
    @Query("select t.staffUnread, count(t) from SupportTicket t group by t.staffUnread")
    List<Object[]> countByStaffUnread();
}
