package com.draazy.api.services.request;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.services.ticket.Ticket;
import com.draazy.api.services.ticket.TicketRepository;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
class TicketMirror {
    static final String INDEX = "uq_service_requests_ticket";

    private final TicketRepository tickets;

    TicketMirror(TicketRepository tickets) {
        this.tickets = tickets;
    }

    UUID resolve(AuthPrincipal caller, String ticketId) {
        String raw = ticketId == null || ticketId.isBlank() ? null : ticketId.trim();
        if (raw == null) {
            return null;
        }
        Ticket ticket = Ids.parseUuid(raw)
                .flatMap(tickets::findById)
                .orElseThrow(() -> NotFoundException.of("Ticket"));
        if (!caller.userId().equals(ticket.getRequesterId())) {
            throw NotFoundException.of("Ticket");
        }
        return ticket.getId();
    }

    static ConflictException alreadyMirrored() {
        return new ConflictException("That enquiry already has a service request open against it. "
                + "Continue with the existing one rather than starting a second.");
    }
}
