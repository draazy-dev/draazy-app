package com.draazy.api.services.support;

import com.draazy.api.common.persistence.AfterCommit;
import com.draazy.api.common.trust.SupportActivity;
import com.draazy.api.common.trust.SupportActivity.Side;
import com.draazy.api.leads.conversation.MessageEventHub;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Keeps support_conversations current from every message written in any of the four places. */
@Component
class SupportConversationIndex {
    static final int PREVIEW_MAX = 140;

    private final NamedParameterJdbcTemplate jdbc;
    private final MessageEventHub hub;
    private final SupportChatStaffStream staffStream;
    private final SupportChatScopes scopes;

    SupportConversationIndex(NamedParameterJdbcTemplate jdbc, MessageEventHub hub,
            SupportChatStaffStream staffStream, SupportChatScopes scopes) {
        this.jdbc = jdbc;
        this.hub = hub;
        this.staffStream = staffStream;
        this.scopes = scopes;
    }

    @EventListener
    void on(SupportActivity activity) {
        boolean fromUser = activity.side() == Side.USER;
        OffsetDateTime at = OffsetDateTime.ofInstant(activity.at(), ZoneOffset.UTC);
        String preview = preview(activity.preview());
        String from = fromUser ? "user" : "staff";
        jdbc.update("""
                insert into support_conversation_topics
                    (user_id, about_type, about_id, status, staff_unread, last_at, last_preview, last_from)
                values (:user, coalesce(:type, 'general'), coalesce(:id, ''), :status, :staffUnread, :at,
                        :preview, :from)
                on conflict (user_id, about_type, about_id) do update set
                    status = excluded.status, staff_unread = excluded.staff_unread,
                    last_at = excluded.last_at, last_preview = excluded.last_preview,
                    last_from = excluded.last_from
                """, new MapSqlParameterSource()
                .addValue("user", activity.userId())
                .addValue("type", activity.aboutType())
                .addValue("id", activity.aboutId())
                .addValue("status", fromUser ? "awaiting" : "answered")
                .addValue("staffUnread", fromUser)
                .addValue("at", at)
                .addValue("preview", preview)
                .addValue("from", from));
        jdbc.update("""
                insert into support_conversations
                    (user_id, status, assignee_id, staff_unread, user_unread, last_at, last_preview, last_from,
                     last_about_type, last_about_id)
                values (:user,
                        case when exists (select 1 from support_conversation_topics
                                           where user_id = :user and status = 'awaiting')
                             then 'awaiting' else 'answered' end,
                        cast(:staff as uuid),
                        exists (select 1 from support_conversation_topics where user_id = :user and staff_unread),
                        :userUnread, :at, :preview, :from, :type, :id)
                on conflict (user_id) do update set
                    status = excluded.status,
                    assignee_id = coalesce(support_conversations.assignee_id, excluded.assignee_id),
                    staff_unread = excluded.staff_unread,
                    user_unread = support_conversations.user_unread or excluded.user_unread,
                    last_at = excluded.last_at, last_preview = excluded.last_preview,
                    last_from = excluded.last_from, last_about_type = excluded.last_about_type,
                    last_about_id = excluded.last_about_id,
                    version = support_conversations.version + 1, updated_at = now()
                """, new MapSqlParameterSource()
                .addValue("user", activity.userId())
                .addValue("staff", claimant(activity.staffId()))
                .addValue("userUnread", !fromUser)
                .addValue("at", at)
                .addValue("preview", preview)
                .addValue("from", from)
                .addValue("type", activity.aboutType())
                .addValue("id", activity.aboutId()));
        // A fresh statement, so it sees topics committed by a concurrent writer the upsert above waited on.
        jdbc.update("""
                update support_conversations set
                    status = case when exists (select 1 from support_conversation_topics
                                                where user_id = :user and status = 'awaiting')
                                  then 'awaiting' else 'answered' end,
                    staff_unread = exists (select 1 from support_conversation_topics
                                            where user_id = :user and staff_unread)
                 where user_id = :user
                """, Map.of("user", activity.userId()));
        AfterCommit.run(() -> {
            hub.publish(activity.userId(), "support", Map.of("at", activity.at()));
            staffStream.publish(activity.userId());
        });
    }

    /** A desk answering its own topic must not look like Support has taken the whole chat. */
    private String claimant(UUID id) {
        if (id == null) {
            return null;
        }
        String role = jdbc.queryForList("select role from users where id = :id", Map.of("id", id), String.class)
                .stream().findFirst().orElse(null);
        return role != null && scopes.resolve(role, id).full() ? id.toString() : null;
    }

    static String preview(String body) {
        String flat = body == null ? "" : body.replaceAll("\\s+", " ").strip();
        return flat.length() > PREVIEW_MAX ? flat.substring(0, PREVIEW_MAX) : flat;
    }
}
