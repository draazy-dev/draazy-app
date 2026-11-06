package com.draazy.api.services.support;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.common.trust.SupportActivity;
import com.draazy.api.common.trust.SupportActivity.Side;
import com.draazy.api.common.web.Ids;
import com.draazy.api.common.web.Pageables;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AccountPermissions;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.BackOfficePermissions;
import com.draazy.api.security.Roles;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Limit;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SupportTicketService {
    private final SupportTicketRepository tickets;
    private final SupportTicketMessageRepository messages;
    private final SupportTicketMapper mapper;
    private final UserRepository users;
    private final AccountPermissions permissions;
    private final Notifier notifier;
    private final SupportTicketAbouts abouts;
    private final ApplicationEventPublisher events;

    public SupportTicketService(SupportTicketRepository tickets,
            SupportTicketMessageRepository messages, SupportTicketMapper mapper,
            UserRepository users, AccountPermissions permissions, Notifier notifier,
            SupportTicketAbouts abouts, ApplicationEventPublisher events) {
        this.tickets = tickets;
        this.messages = messages;
        this.mapper = mapper;
        this.users = users;
        this.permissions = permissions;
        this.notifier = notifier;
        this.abouts = abouts;
        this.events = events;
    }

    @Transactional(readOnly = true)
    public List<SupportTicketSummary> list(AuthPrincipal caller) {
        return mapper.toSummaries(tickets.findByUserIdOrderByCreatedAtDesc(caller.userId()));
    }

    @Transactional(readOnly = true)
    public Page<AdminSupportTicketDto> queue(Boolean awaitingReply, Integer days, Pageable pageable) {
        Instant since = PlatformTime.sinceOrNull(days);
        return mapper.toAdminPage(tickets.findQueue(awaitingReply == null, Boolean.TRUE.equals(awaitingReply),
                since == null ? Instant.EPOCH : since, Pageables.unsorted(pageable)));
    }

    @Transactional(readOnly = true)
    public Map<String, Long> queueCounts() {
        long awaiting = 0;
        long answered = 0;
        for (Object[] row : tickets.countByStaffUnread()) {
            if ((Boolean) row[0]) {
                awaiting += (Long) row[1];
            } else {
                answered += (Long) row[1];
            }
        }
        return Map.of("awaiting", awaiting, "answered", answered, "all", awaiting + answered);
    }

    @Transactional
    public SupportTicketDto create(AuthPrincipal caller, SupportTicketCreate body) {
        SupportTicketAbout about = body.about() == null ? null : abouts.check(caller.userId(), body.about());
        SupportTicket ticket = SupportTicketStatuses.isIdentity(body.category()) ? null
                : tickets.findOpenChat(caller.userId()).orElse(null);
        if (ticket == null) {
            ticket = new SupportTicket(caller.userId(), body.subject(), body.category(), about);
        }
        ticket.setStaffUnread(true);
        ticket = tickets.saveAndFlush(ticket);
        write(ticket, caller, body.body(), about);
        return mapper.toDto(ticket);
    }

    /** Posts into the user's one support-chat ticket: the open one, else the newest one reopened, else a new one. */
    @Transactional
    public void postToChat(AuthPrincipal author, UUID userId, String body, SupportTicketAbout about) {
        SupportTicketAbout checked = about == null ? null : abouts.check(userId, about);
        SupportTicket ticket = tickets.findOpenChat(userId).orElseGet(() -> resumeOrStart(userId));
        write(ticket, author, body, checked);
        settle(ticket, author, body);
    }

    private SupportTicket resumeOrStart(UUID userId) {
        SupportTicket latest = tickets.findChatsNewestFirst(userId, Limit.of(1)).stream().findFirst().orElse(null);
        if (latest == null) {
            return tickets.saveAndFlush(new SupportTicket(userId, "Support chat", "other", null));
        }
        latest.reopen();
        return tickets.saveAndFlush(latest);
    }

    @Transactional(readOnly = true)
    public SupportTicketDto get(AuthPrincipal caller, String id) {
        SupportTicket ticket = readable(caller, id, BackOfficePermissions.TICKETS_READ);
        return mapper.toDto(ticket);
    }

    @Transactional
    public MessageDto reply(AuthPrincipal caller, String id, String body) {
        SupportTicket ticket = readable(caller, id, BackOfficePermissions.TICKETS_WRITE);
        SupportTicketMessage sent = write(ticket, caller, body, null);
        settle(ticket, caller, body);
        User author = users.findById(caller.userId()).orElse(null);
        return new MessageDto(
                sent.getId().toString(),
                author == null ? null : author.getName(),
                sent.getAuthorRole(),
                sent.getBody(),
                sent.getCreatedAt());
    }

    private void settle(SupportTicket ticket, AuthPrincipal caller, String body) {
        if (ticket.getUserId().equals(caller.userId())) {
            ticket.setStaffUnread(true);
        } else {
            ticket.setStaffUnread(false);
            ticket.setUnread(true);
            String snippet = body == null ? "" : body.strip();
            String preview = snippet.length() > 100 ? snippet.substring(0, 97) + "..." : snippet;
            notifier.notify(ticket.getUserId(), "support.reply",
                    "New reply from Draazy support",
                    preview,
                    threadLink(ticket));
        }
        tickets.saveAndFlush(ticket);
    }

    @Transactional
    public SupportTicketDto close(AuthPrincipal caller, String id) {
        SupportTicket ticket = readable(caller, id, BackOfficePermissions.TICKETS_WRITE);
        if (!SupportTicketStatuses.CLOSED.equals(ticket.getStatus())) {
            ticket.close();
            ticket.setUnread(true);
            tickets.saveAndFlush(ticket);
            notifier.notify(ticket.getUserId(), "support.closed", "Your support conversation was closed",
                    ticket.getSubject(), threadLink(ticket));
        }
        return mapper.toDto(ticket);
    }

    @Transactional
    public void markRead(AuthPrincipal caller, String id) {
        SupportTicket ticket = readable(caller, id, BackOfficePermissions.TICKETS_WRITE);
        boolean raiser = ticket.getUserId().equals(caller.userId());
        if (raiser && ticket.isUnread()) {
            ticket.setUnread(false);
            tickets.saveAndFlush(ticket);
        } else if (!raiser && ticket.isStaffUnread()) {
            ticket.setStaffUnread(false);
            tickets.saveAndFlush(ticket);
        }
    }

    private static String threadLink(SupportTicket ticket) {
        return "/messages?support=ticket:" + ticket.getId();
    }

    private SupportTicketMessage write(SupportTicket ticket, AuthPrincipal author, String body,
            SupportTicketAbout about) {
        SupportTicketMessage saved = messages.saveAndFlush(new SupportTicketMessage(
                ticket.getId(), author.userId(), author.role(), body, about));
        boolean identity = SupportTicketStatuses.isIdentity(ticket.getCategory());
        boolean fromUser = ticket.getUserId().equals(author.userId());
        events.publishEvent(new SupportActivity(ticket.getUserId(),
                fromUser ? Side.USER : Side.STAFF, fromUser ? null : author.userId(),
                identity ? "identity" : about == null ? "general" : about.type(),
                identity ? ticket.getId().toString() : about == null ? null : about.id(),
                body, saved.getCreatedAt() == null ? Instant.now() : saved.getCreatedAt()));
        return saved;
    }

    private SupportTicket readable(AuthPrincipal caller, String id, String permission) {
        SupportTicket ticket = Ids.parseUuid(id).flatMap(tickets::findById)
                .orElseThrow(() -> NotFoundException.of("Support ticket"));
        if (ticket.getUserId().equals(caller.userId())) {
            return ticket;
        }
        if (!Roles.isBackOffice(caller.role())) {
            throw NotFoundException.of("Support ticket");
        }
        if (!permissions.granted(caller, permission) && !identityGranted(ticket, caller, permission)) {
            throw new ForbiddenException("Your account cannot access support tickets.");
        }
        return ticket;
    }

    private boolean identityGranted(SupportTicket ticket, AuthPrincipal caller, String permission) {
        return SupportTicketStatuses.isIdentity(ticket.getCategory()) && permissions.granted(caller,
                BackOfficePermissions.TICKETS_WRITE.equals(permission) ? BackOfficePermissions.IDENTITY_WRITE
                        : BackOfficePermissions.IDENTITY_READ);
    }
}
