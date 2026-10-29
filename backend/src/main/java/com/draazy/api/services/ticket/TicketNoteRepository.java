package com.draazy.api.services.ticket;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TicketNoteRepository extends JpaRepository<TicketNote, UUID> {
    List<TicketNote> findByTicketIdOrderByAtAsc(UUID ticketId);

    List<TicketNote> findByTicketIdInOrderByAtAsc(Collection<UUID> ticketIds);
}
