package com.draazy.api.services.support;

import com.draazy.api.services.support.SupportChatDto.About;
import com.draazy.api.services.support.SupportChatDto.Case;
import com.draazy.api.services.support.SupportChatDto.Msg;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Reads one user's chat as a single timeline across the four places its messages live. */
@Component
class SupportChatTimeline {
    static final int CAP = 300;

    private static final String IDENTITY = "t.category in ('identity_dispute', 'identity_appeal')";
    private static final String STAFF_ROLES = "('staff', 'manager', 'admin')";

    private static final String MERGED = """
              select 't:' || m.id as id, case when m.author_id = t.user_id then 'user' else 'staff' end as side,
                     m.author_id, m.body, m.created_at as at,
                     case when %1$s then 'identity' else coalesce(m.about_type, 'general') end as about_type,
                     case when %1$s then t.id::text else m.about_id end as about_id
                from support_ticket_messages m join support_tickets t on t.id = m.ticket_id
               where t.user_id = :user
              union all
              select 'r:' || rm.id, case when rm.sender_id = o.user_id then 'user' else 'staff' end,
                     rm.sender_id, rm.body, rm.created_at, o.about_type, o.about_id
                from review_messages rm join support_review_owners o on o.review_id = rm.review_id
               where o.user_id = :user and not rm.internal
              union all
              select 's:' || sm.id, case when sm.author_role in %2$s then 'staff' else 'user' end,
                     sm.author_id, sm.body, sm.created_at, 'request', sr.id::text
                from service_request_messages sm join service_requests sr on sr.id = sm.request_id
               where sr.requester_id = :user
            """.formatted(IDENTITY, STAFF_ROLES);

    private static final String MESSAGES = "select * from (" + MERGED
            + ") x where %s order by at desc, id desc limit :cap";

    private static final String UNREAD = """
            select (select count(*) from support_ticket_messages m join support_tickets t on t.id = m.ticket_id
                     where t.user_id = :user and t.unread and m.author_id is distinct from t.user_id
                       and m.created_at > coalesce((select max(x.created_at) from support_ticket_messages x
                                                     where x.ticket_id = t.id and x.author_id = t.user_id),
                                                   'epoch'))
                 + (select count(*) from review_messages rm join support_review_owners o on o.review_id = rm.review_id
                     where o.user_id = :user and not rm.internal and rm.read_at is null
                       and rm.sender_id is distinct from o.user_id)
                 + (select count(*) from service_request_messages sm join service_requests sr on sr.id = sm.request_id
                     where sr.requester_id = :user and sm.read_at is null and sm.author_role in %s)
            """.formatted(STAFF_ROLES);

    private final NamedParameterJdbcTemplate jdbc;
    private final SupportChatLabels labels;

    SupportChatTimeline(NamedParameterJdbcTemplate jdbc, SupportChatLabels labels) {
        this.jdbc = jdbc;
        this.labels = labels;
    }

    record Entry(Msg msg, UUID authorId) {
    }

    /** Oldest first; `own` is how the customer's own messages are named to the reader ("me" or "user"). */
    List<Msg> messages(UUID userId, String own) {
        return messages(userId, own, SupportChatScope.FULL);
    }

    List<Msg> messages(UUID userId, String own, SupportChatScope scope) {
        return entries(userId, own, CAP, scope).stream().map(Entry::msg).toList();
    }

    Msg latestBy(UUID userId, UUID authorId, String own) {
        List<Entry> recent = entries(userId, own, 20, SupportChatScope.FULL);
        for (int i = recent.size() - 1; i >= 0; i--) {
            if (authorId.equals(recent.get(i).authorId())) {
                return recent.get(i).msg();
            }
        }
        return null;
    }

    int count(UUID userId, String aboutType, String aboutId) {
        Integer count = jdbc.queryForObject("select count(*) from (" + MERGED
                + ") x where x.about_type = :type and x.about_id = :about",
                Map.of("user", userId, "type", aboutType, "about", aboutId), Integer.class);
        return count == null ? 0 : count;
    }

    int unread(UUID userId) {
        Integer count = jdbc.queryForObject(UNREAD, Map.of("user", userId), Integer.class);
        return count == null ? 0 : count;
    }

    private List<Entry> entries(UUID userId, String own, int cap, SupportChatScope scope) {
        SupportChatLabels.Resolver names = labels.resolver();
        MapSqlParameterSource params = new MapSqlParameterSource("user", userId).addValue("cap", cap);
        String sql = MESSAGES.formatted(scope.about("x.about_type", "x.about_id", params));
        List<Entry> found = new ArrayList<>(jdbc.query(sql, params, (rs, i) -> {
            String aboutType = rs.getString("about_type");
            String aboutId = rs.getString("about_id");
            boolean staff = "staff".equals(rs.getString("side"));
            UUID author = (UUID) rs.getObject("author_id");
            Msg msg = new Msg(rs.getString("id"), staff ? "staff" : own, null, rs.getString("body"),
                    rs.getObject("at", OffsetDateTime.class).toInstant(),
                    new About(aboutType, aboutId, names.label(aboutType, aboutId)));
            return new Entry(msg, author);
        }));
        Collections.reverse(found);
        return withStaffNames(found);
    }

    private List<Entry> withStaffNames(List<Entry> entries) {
        List<UUID> staffIds = entries.stream().filter(e -> "staff".equals(e.msg().from()))
                .map(Entry::authorId).filter(Objects::nonNull).distinct().toList();
        if (staffIds.isEmpty()) {
            return entries;
        }
        Map<UUID, String> byId = new HashMap<>();
        jdbc.query("select id, name from users where id in (:ids)", Map.of("ids", staffIds),
                rs -> {
                    byId.put((UUID) rs.getObject("id"), rs.getString("name"));
                });
        return entries.stream().map(e -> "staff".equals(e.msg().from())
                ? new Entry(new Msg(e.msg().id(), e.msg().from(), byId.get(e.authorId()), e.msg().text(),
                        e.msg().at(), e.msg().about()), e.authorId())
                : e).toList();
    }

    List<Case> cases(UUID userId) {
        return cases(userId, SupportChatScope.FULL);
    }

    List<Case> cases(UUID userId, SupportChatScope scope) {
        SupportChatLabels.Resolver names = labels.resolver();
        List<Case> found = new ArrayList<>();
        MapSqlParameterSource params = new MapSqlParameterSource("user", userId);
        jdbc.query("""
                select about_type, about_id, status from support_review_owners
                 where user_id = :user and status in ('pending', 'needs_info') and
                """ + scope.about("about_type", "about_id", params), params, rs -> {
            String type = rs.getString("about_type");
            String id = rs.getString("about_id");
            String status = "needs_info".equals(rs.getString("status")) ? "needs_info" : "in_review";
            found.add(new Case(type, id, names.label(type, id), status, true));
        });
        jdbc.query("""
                select id, status from service_requests
                 where requester_id = :user and status not in ('completed', 'cancelled', 'awaiting-payment')
                   and
                """ + scope.requestTeam("team", params) + " order by created_at desc", params, rs -> {
            String id = rs.getString("id");
            found.add(new Case("request", id, names.label("request", id), rs.getString("status"), true));
        });
        if (scope.allows("identity")) {
            jdbc.query("select t.id, t.status from support_tickets t where t.user_id = :user and " + IDENTITY
                    + " and t.status not in ('resolved', 'closed') order by t.created_at desc",
                    params, rs -> {
                String id = rs.getString("id");
                found.add(new Case("identity", id, names.label("identity", id), rs.getString("status"), true));
            });
        }
        return found;
    }
}
