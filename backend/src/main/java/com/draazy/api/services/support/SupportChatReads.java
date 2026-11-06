package com.draazy.api.services.support;

import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

// Set-based updates, not load-modify-save, so overlapping calls queue on row locks instead of 409-ing.
@Component
class SupportChatReads {
    private static final String STAFF_ROLES = "('staff', 'manager', 'admin')";

    private final NamedParameterJdbcTemplate jdbc;

    SupportChatReads(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    void customerRead(UUID user) {
        lock(user);
        Map<String, Object> p = Map.of("user", user);
        jdbc.update("""
                update support_conversations set user_unread = false, version = version + 1, updated_at = now()
                 where user_id = :user and user_unread
                """, p);
        jdbc.update("""
                update support_tickets set unread = false, version = version + 1
                 where user_id = :user and unread
                """, p);
        jdbc.update("""
                update review_messages rm set read_at = now()
                  from support_review_owners o
                 where o.review_id = rm.review_id and o.user_id = :user and not rm.internal
                   and rm.read_at is null and rm.sender_id is distinct from o.user_id
                """, p);
        jdbc.update("""
                update service_request_messages sm set read_at = now()
                  from service_requests sr
                 where sr.id = sm.request_id and sr.requester_id = :user and sm.read_at is null
                   and sm.author_role in %s
                """.formatted(STAFF_ROLES), p);
    }

    void staffRead(UUID user, SupportChatScope scope) {
        lock(user);
        MapSqlParameterSource p = new MapSqlParameterSource("user", user);
        String topics = scope.about("about_type", "about_id", p);
        jdbc.update("update support_conversation_topics set staff_unread = false where user_id = :user and staff_unread"
                + " and " + topics, p);
        jdbc.update("""
                update support_conversations set staff_unread = false, version = version + 1, updated_at = now()
                 where user_id = :user and staff_unread
                   and not exists (select 1 from support_conversation_topics
                                    where user_id = :user and staff_unread)
                """, p);
        // The chat ticket is shared by several topics, so it is only cleared once none of them is unread.
        jdbc.update("""
                update support_tickets t set staff_unread = false, version = version + 1
                 where t.user_id = :user and t.staff_unread
                   and case when t.category in ('identity_dispute', 'identity_appeal') then %s
                            else not exists (select 1 from support_conversation_topics s
                                              where s.user_id = :user and s.staff_unread
                                                and s.about_type not in ('request', 'identity')) end
                """.formatted(scope.allows("identity") ? "true" : "false"), p);
        jdbc.update("""
                update review_messages rm set read_at = now()
                  from support_review_owners o
                 where o.review_id = rm.review_id and o.user_id = :user and not rm.internal
                   and rm.read_at is null and rm.sender_id is not distinct from o.user_id
                   and %s
                """.formatted(scope.about("o.about_type", "o.about_id", p)), p);
        jdbc.update("""
                update service_request_messages sm set read_at = now()
                  from service_requests sr
                 where sr.id = sm.request_id and sr.requester_id = :user and sm.read_at is null
                   and sm.author_role not in %s and %s
                """.formatted(STAFF_ROLES, scope.requestTeam("sr.team", p)), p);
    }

    private void lock(UUID user) {
        jdbc.query("select pg_advisory_xact_lock(hashtext(:user))", Map.of("user", user.toString()), rs -> {
        });
    }
}
