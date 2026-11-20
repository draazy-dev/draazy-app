package com.draazy.api.services.support;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.services.support.SupportChatDto.Assignee;
import com.draazy.api.services.support.SupportChatDto.Msg;
import com.draazy.api.services.support.SupportChatDto.Post;
import com.draazy.api.services.support.SupportChatDto.View;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** A customer's one continuous support chat. */
@Service
public class SupportChatService {
    private static final String OWN = "me";

    private final NamedParameterJdbcTemplate jdbc;
    private final SupportChatTimeline timeline;
    private final SupportChatRouter router;
    private final SupportChatReads reads;
    private final EntityManager em;

    SupportChatService(NamedParameterJdbcTemplate jdbc, SupportChatTimeline timeline, SupportChatRouter router,
            SupportChatReads reads, EntityManager em) {
        this.jdbc = jdbc;
        this.timeline = timeline;
        this.router = router;
        this.reads = reads;
        this.em = em;
    }

    @Transactional(readOnly = true)
    public View view(AuthPrincipal caller) {
        UUID user = caller.userId();
        List<View> found = jdbc.query("""
                select c.status, a.name as assignee_name
                  from support_conversations c left join users a on a.id = c.assignee_id
                 where c.user_id = :user
                """, Map.of("user", user), (rs, i) -> new View(rs.getString("status"), 0,
                rs.getString("assignee_name") == null ? null : new Assignee(rs.getString("assignee_name")),
                List.of(), List.of()));
        String status = found.isEmpty() ? "none" : found.getFirst().status();
        Assignee assignee = found.isEmpty() ? null : found.getFirst().assignee();
        return new View(status, timeline.unread(user), assignee, timeline.messages(user, OWN),
                timeline.cases(user));
    }

    @Transactional(readOnly = true)
    public UnreadCount unreadCount(AuthPrincipal caller) {
        return new UnreadCount(timeline.unread(caller.userId()));
    }

    public record UnreadCount(int count) {
    }

    @Transactional
    public Msg send(AuthPrincipal caller, Post body) {
        router.send(caller, caller.userId(), false, body.text().strip(), body.about());
        em.flush();
        Msg sent = timeline.latestBy(caller.userId(), caller.userId(), OWN);
        if (sent == null) {
            throw NotFoundException.of("Message");
        }
        return sent;
    }

    @Transactional
    public void markRead(AuthPrincipal caller) {
        reads.customerRead(caller.userId());
    }
}
