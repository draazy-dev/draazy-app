package com.draazy.api.services.support;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.ErrorCodes;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.FlatmateCaseFiles;
import com.draazy.api.common.trust.PropertyReviewThread;
import com.draazy.api.common.web.Ids;
import com.draazy.api.engagement.flatmate.FlatmateCaseService;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.services.request.ServiceRequestService;
import com.draazy.api.services.support.SupportChatDto.AboutRef;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Sends one chat message to wherever its context lives, so each case keeps its own thread and rules. */
@Component
class SupportChatRouter {
    private static final Set<String> TICKET_ABOUTS = Set.of("property", "flatmate_room", "flatmate_group",
            "flatmate_post", "invoice");
    private static final Map<String, String> FLATMATE_KINDS = Map.of(
            "flatmate_room", FlatmateCaseFiles.KIND_ROOM,
            "flatmate_group", FlatmateCaseFiles.KIND_GROUP,
            "flatmate_post", FlatmateCaseFiles.KIND_POST);

    private final NamedParameterJdbcTemplate jdbc;
    private final SupportTicketService tickets;
    private final SupportTicketRepository ticketRows;
    private final ServiceRequestService requests;
    private final PropertyReviewThread reviews;
    private final FlatmateCaseService flatmate;

    SupportChatRouter(NamedParameterJdbcTemplate jdbc, SupportTicketService tickets,
            SupportTicketRepository ticketRows, ServiceRequestService requests, PropertyReviewThread reviews,
            FlatmateCaseService flatmate) {
        this.jdbc = jdbc;
        this.tickets = tickets;
        this.ticketRows = ticketRows;
        this.requests = requests;
        this.reviews = reviews;
        this.flatmate = flatmate;
    }

    /** The customer writes as themselves; staff write on the customer's behalf only where a staff path exists. */
    void send(AuthPrincipal author, UUID userId, boolean staff, String text, AboutRef about) {
        String type = about == null ? "general" : about.type();
        String id = about == null ? null : about.id();
        switch (type) {
            case "request" -> toRequest(author, userId, id, text);
            case "identity" -> toIdentityTicket(author, userId, id, text);
            case "property" -> {
                if (openReview(userId, type, id)) {
                    reviews.post(author, id, text);
                } else {
                    toChatTicket(author, userId, text, about);
                }
            }
            case "flatmate_room", "flatmate_group", "flatmate_post" -> {
                if (!staff && openReview(userId, type, id)) {
                    flatmate.reply(author, FLATMATE_KINDS.get(type), Ids.parseUuid(id).orElseThrow(), text);
                } else {
                    toChatTicket(author, userId, text, about);
                }
            }
            default -> toChatTicket(author, userId, text, about);
        }
    }

    private void toRequest(AuthPrincipal author, UUID userId, String id, String text) {
        UUID request = Ids.parseUuid(id).orElseThrow(() -> NotFoundException.of("Service request"));
        String status = jdbc.queryForList("select status from service_requests where id = :id and requester_id = :user",
                Map.of("id", request, "user", userId), String.class).stream().findFirst()
                .orElseThrow(() -> NotFoundException.of("Service request"));
        if ("completed".equals(status) || "cancelled".equals(status)) {
            throw new ConflictException(ErrorCodes.REQUEST_CLOSED,
                    "This request is " + status + " — start a new one to continue.");
        }
        requests.addMessage(author, request.toString(), text);
    }

    private void toIdentityTicket(AuthPrincipal author, UUID userId, String id, String text) {
        UUID ticket = Ids.parseUuid(id).orElseThrow(() -> NotFoundException.of("Support ticket"));
        SupportTicket row = ticketRows.findById(ticket)
                .filter(t -> t.getUserId().equals(userId) && SupportTicketStatuses.isIdentity(t.getCategory()))
                .orElseThrow(() -> NotFoundException.of("Support ticket"));
        if (SupportTicketStatuses.RESOLVED.equals(row.getStatus()) || SupportTicketStatuses.CLOSED.equals(row.getStatus())) {
            throw new ConflictException("This case is closed.");
        }
        tickets.reply(author, ticket.toString(), text);
    }

    private void toChatTicket(AuthPrincipal author, UUID userId, String text, AboutRef about) {
        SupportTicketAbout tagged = null;
        if (about != null && TICKET_ABOUTS.contains(about.type())) {
            if (about.id() == null || about.id().isBlank()) {
                throw new BadRequestException("about.id is required for " + about.type());
            }
            tagged = new SupportTicketAbout(about.type(), about.id());
        } else if (about != null && !"general".equals(about.type())) {
            throw new BadRequestException("Unknown about.type");
        }
        tickets.postToChat(author, userId, text, tagged);
    }

    private boolean openReview(UUID userId, String type, String id) {
        UUID subject = Ids.parseUuid(id).orElse(null);
        return subject != null && !jdbc.queryForList("""
                select 1 from support_review_owners
                 where user_id = :user and about_type = :type and about_id = :id
                   and status in ('pending', 'needs_info')
                """, Map.of("user", userId, "type", type, "id", subject.toString())).isEmpty();
    }
}
