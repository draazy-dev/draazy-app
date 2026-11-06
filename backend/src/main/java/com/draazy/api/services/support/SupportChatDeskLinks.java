package com.draazy.api.services.support;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.services.support.StaffSupportChatDto.Located;
import com.draazy.api.services.support.StaffSupportChatDto.ServiceTicketCreated;
import com.draazy.api.services.support.StaffSupportChatDto.ServiceTicketPost;
import com.draazy.api.services.ticket.CustomerTicketDto;
import com.draazy.api.services.ticket.TicketService;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** What a desk does from a subject it is looking at: jump to its customer's chat, or hand it to a service team. */
@Service
public class SupportChatDeskLinks {
    private static final Map<String, String> OWNER = Map.of(
            "property", "select owner_id from properties where id = :id",
            "flatmate_room", "select host_id from flatmate_rooms where id = :id",
            "flatmate_group", "select host_id from flatmate_groups where id = :id",
            "flatmate_post", "select user_id from flatmate_seeker_posts where id = :id",
            "request", "select requester_id from service_requests where id = :id",
            "identity", "select user_id from support_tickets where id = :id"
                    + " and category in ('identity_dispute', 'identity_appeal')");

    private final NamedParameterJdbcTemplate jdbc;
    private final SupportChatScopes scopes;
    private final SupportChatTimeline timeline;
    private final TicketService tickets;

    SupportChatDeskLinks(NamedParameterJdbcTemplate jdbc, SupportChatScopes scopes, SupportChatTimeline timeline,
            TicketService tickets) {
        this.jdbc = jdbc;
        this.scopes = scopes;
        this.timeline = timeline;
        this.tickets = tickets;
    }

    @Transactional(readOnly = true)
    public Located locate(AuthPrincipal caller, String type, String id) {
        SupportChatScope scope = scopes.require(caller);
        if (type == null || !(OWNER.containsKey(type) || "invoice".equals(type))) {
            throw new BadRequestException("Unknown subject type: " + type);
        }
        if (!scope.allows(type)) {
            throw new ForbiddenException("This chat topic is outside your desk.");
        }
        String subject = "invoice".equals(type) ? id : Ids.parseUuid(id).map(UUID::toString).orElse(null);
        UUID owner = subject == null ? null : ownerOf(type, subject);
        if (owner == null) {
            throw NotFoundException.of("Support subject");
        }
        if (!scope.full() && "request".equals(type)) {
            requireDesk(scope, UUID.fromString(subject));
        }
        String name = first(jdbc.queryForList("select name from users where id = :id", Map.of("id", owner),
                String.class));
        return new Located(owner, name, timeline.count(owner, type, subject));
    }

    @Transactional
    public ServiceTicketCreated createServiceTicket(AuthPrincipal caller, UUID userId, ServiceTicketPost body) {
        scopes.requireFull(caller);
        CustomerTicketDto made = tickets.createForCustomer(userId, body.subject(), body.team(), body.propertyId(),
                body.note());
        return new ServiceTicketCreated(made.id(), made.team());
    }

    private UUID ownerOf(String type, String subject) {
        if ("invoice".equals(type)) {
            return first(jdbc.queryForList("select user_id from invoices where number = :id", Map.of("id", subject),
                    UUID.class));
        }
        return first(jdbc.queryForList(OWNER.get(type), Map.of("id", UUID.fromString(subject)), UUID.class));
    }

    // Not stream().findFirst(): it throws on a SQL NULL in the first row.
    private static <T> T first(List<T> rows) {
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void requireDesk(SupportChatScope scope, UUID request) {
        String team = jdbc.queryForObject("select team from service_requests where id = :id", Map.of("id", request),
                String.class);
        if (team == null || !scope.desks().contains(team)) {
            throw new ForbiddenException("This chat topic is outside your desk.");
        }
    }
}
