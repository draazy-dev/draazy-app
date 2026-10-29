package com.draazy.api.services.support;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SupportTicketMessageRepository extends JpaRepository<SupportTicketMessage, UUID> {
    List<SupportTicketMessage> findByTicketIdOrderByCreatedAtAsc(UUID ticketId);

    List<SupportTicketMessage> findByTicketIdInOrderByCreatedAtAsc(Collection<UUID> ticketIds);

    @Query("""
            select m from SupportTicketMessage m
             where m.ticketId in :ticketIds
               and m.createdAt = (select max(x.createdAt) from SupportTicketMessage x
                                   where x.ticketId = m.ticketId)
            """)
    List<SupportTicketMessage> findLatestByTicketIdIn(@Param("ticketIds") Collection<UUID> ticketIds);
}
