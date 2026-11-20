package com.draazy.api.services.support;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.persistence.AfterCommit;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Ids;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.services.support.StaffSupportChatDto.Counts;
import com.draazy.api.services.support.StaffSupportChatDto.Customer;
import com.draazy.api.services.support.StaffSupportChatDto.Detail;
import com.draazy.api.services.support.StaffSupportChatDto.Row;
import com.draazy.api.services.support.SupportChatDto.AboutRef;
import com.draazy.api.services.support.SupportChatDto.Case;
import com.draazy.api.services.support.SupportChatDto.Msg;
import com.draazy.api.services.support.SupportChatDto.Post;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/** Staff side of the support chats: one inbox across every customer. */
@Service
public class StaffSupportChatService {
    private static final String CUSTOMER = "user";

    private final NamedParameterJdbcTemplate jdbc;
    private final SupportChatInbox inbox;
    private final SupportChatTimeline timeline;
    private final SupportChatRouter router;
    private final SupportChatReads reads;
    private final SupportChatStaffStream stream;
    private final SupportChatScopes scopes;
    private final EntityManager em;

    StaffSupportChatService(NamedParameterJdbcTemplate jdbc, SupportChatInbox inbox, SupportChatTimeline timeline,
            SupportChatRouter router, SupportChatReads reads, SupportChatStaffStream stream,
            SupportChatScopes scopes, EntityManager em) {
        this.jdbc = jdbc;
        this.inbox = inbox;
        this.timeline = timeline;
        this.router = router;
        this.reads = reads;
        this.stream = stream;
        this.scopes = scopes;
        this.em = em;
    }

    @Transactional(readOnly = true)
    public Page<Row> list(AuthPrincipal caller, String view, String context, Pageable pageable) {
        return inbox.list(caller, scopes.require(caller), view, context, pageable);
    }

    @Transactional(readOnly = true)
    public Counts counts(AuthPrincipal caller) {
        return inbox.counts(caller, scopes.require(caller));
    }

    @Transactional(readOnly = true)
    public Detail detail(AuthPrincipal caller, UUID userId) {
        SupportChatScope scope = scopes.require(caller);
        Customer customer = customer(userId);
        Row row = inbox.row(userId, scope);
        List<Case> cases = timeline.cases(userId, scope);
        if (!scope.full() && row == null && cases.isEmpty()) {
            throw NotFoundException.of("Support chat");
        }
        return new Detail(customer, row == null ? "none" : row.status(), row == null ? null : row.assignee(),
                timeline.messages(userId, CUSTOMER, scope), cases);
    }

    @Transactional
    public Msg send(AuthPrincipal staff, UUID userId, Post body) {
        SupportChatScope scope = scopes.require(staff);
        customer(userId);
        authorize(scope, userId, body.about());
        router.send(staff, userId, true, body.text().strip(), body.about());
        em.flush();
        Msg sent = timeline.latestBy(userId, staff.userId(), CUSTOMER);
        if (sent == null) {
            throw NotFoundException.of("Message");
        }
        return sent;
    }

    @Transactional
    public void assign(AuthPrincipal caller, UUID userId, UUID assigneeId) {
        scopes.requireFull(caller);
        UUID target = assigneeId == null ? caller.userId() : assigneeId;
        boolean staff = !jdbc.queryForList("select 1 from users where id = :id and role in ('staff', 'manager', 'admin')",
                Map.of("id", target)).isEmpty();
        if (!staff) {
            throw new BadRequestException("assigneeId must be a staff member");
        }
        update("update support_conversations set assignee_id = :assignee, version = version + 1, updated_at = now() "
                + "where user_id = :user", userId, target);
        publish(userId);
    }

    @Transactional
    public void resolve(AuthPrincipal caller, UUID userId) {
        scopes.requireFull(caller);
        update("update support_conversations set status = 'resolved', staff_unread = false, version = version + 1, "
                + "updated_at = now() where user_id = :user", userId, null);
        jdbc.update("""
                update support_conversation_topics set status = 'answered', staff_unread = false
                 where user_id = :user
                """, Map.of("user", userId));
        jdbc.update("""
                update support_tickets set status = 'resolved', staff_unread = false, version = version + 1,
                       updated_at = now()
                 where user_id = :user and (category is null or category not in ('identity_dispute', 'identity_appeal'))
                   and status not in ('resolved', 'closed')
                """, Map.of("user", userId));
        publish(userId);
    }

    @Transactional
    public void markRead(AuthPrincipal caller, UUID userId) {
        SupportChatScope scope = scopes.require(caller);
        customer(userId);
        reads.staffRead(userId, scope);
        publish(userId);
    }

    public SseEmitter stream(AuthPrincipal caller) {
        return stream.connect(caller.userId(), scopes.require(caller));
    }

    private void authorize(SupportChatScope scope, UUID userId, AboutRef about) {
        String type = about == null ? "general" : about.type();
        if (!scope.allows(type)) {
            throw new ForbiddenException("This chat topic is outside your desk.");
        }
        if (scope.full() || !"request".equals(type)) {
            return;
        }
        Ids.parseUuid(about.id()).ifPresent(request -> {
            String team = jdbc.queryForList("select team from service_requests where id = :id and requester_id = :user",
                    Map.of("id", request, "user", userId), String.class).stream().findFirst().orElse(null);
            if (team != null && !scope.desks().contains(team)) {
                throw new ForbiddenException("This chat topic is outside your desk.");
            }
        });
    }

    private void update(String sql, UUID userId, UUID assignee) {
        Map<String, Object> params = assignee == null ? Map.of("user", userId)
                : Map.of("user", userId, "assignee", assignee);
        if (jdbc.update(sql, params) == 0) {
            throw NotFoundException.of("Support chat");
        }
    }

    private void publish(UUID userId) {
        AfterCommit.run(() -> stream.publish(userId));
    }

    private Customer customer(UUID userId) {
        List<Customer> found = jdbc.query("select id, name, mobile, verified, role from users where id = :id",
                Map.of("id", userId), (rs, i) -> new Customer(rs.getObject("id", UUID.class), rs.getString("name"),
                        MobileMask.mask(rs.getString("mobile")), rs.getBoolean("verified"),
                        List.of(rs.getString("role"))));
        if (found.isEmpty()) {
            throw NotFoundException.of("Customer");
        }
        return found.getFirst();
    }
}
