package com.draazy.api.services.support;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupportTicketRepository extends JpaRepository<SupportTicket, UUID> {
    List<SupportTicket> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Query("""
            select t from SupportTicket t
            where (:anyReply = true or t.staffUnread = :awaiting)
              and t.createdAt >= :since
            order by t.createdAt desc
            """)
    Page<SupportTicket> findQueue(@Param("anyReply") boolean anyReply, @Param("awaiting") boolean awaiting,
            @Param("since") Instant since, Pageable pageable);
    @Query("select t.staffUnread, count(t) from SupportTicket t group by t.staffUnread")
    List<Object[]> countByStaffUnread();
}
