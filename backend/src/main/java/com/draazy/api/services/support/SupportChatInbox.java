package com.draazy.api.services.support;

import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.services.support.StaffSupportChatDto.Counts;
import com.draazy.api.services.support.StaffSupportChatDto.Person;
import com.draazy.api.services.support.StaffSupportChatDto.Row;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** The staff inbox: one row per customer, read straight from the conversation index. */
@Component
class SupportChatInbox {
    private static final String FULL = """
            select c.user_id, u.name, c.status, c.assignee_id, a.name as assignee_name, c.staff_unread,
                   c.last_at, c.last_preview, c.last_from, c.last_about_type, c.last_about_id
              from support_conversations c
              join users u on u.id = c.user_id
              left join users a on a.id = c.assignee_id
            """;

    // Scoped staff see only their own topics, so status, unread and "last" are recomputed from those topics.
    private static final String SCOPED = """
            with tp as (
              select t.*,
                     row_number() over (partition by t.user_id order by t.last_at desc, t.about_type, t.about_id) as rn,
                     bool_or(t.status = 'awaiting') over (partition by t.user_id) as any_awaiting,
                     bool_or(t.staff_unread) over (partition by t.user_id) as any_unread
                from support_conversation_topics t
               where %s)
            select c.user_id, u.name,
                   case when c.status = 'resolved' then 'resolved' when tp.any_awaiting then 'awaiting'
                        else 'answered' end as status,
                   c.assignee_id, a.name as assignee_name, tp.any_unread as staff_unread, tp.last_at,
                   tp.last_preview, tp.last_from, tp.about_type as last_about_type, tp.about_id as last_about_id
              from tp
              join support_conversations c on c.user_id = tp.user_id
              join users u on u.id = c.user_id
              left join users a on a.id = c.assignee_id
             where tp.rn = 1
            """;

    private final NamedParameterJdbcTemplate jdbc;
    private final SupportChatLabels labels;

    SupportChatInbox(NamedParameterJdbcTemplate jdbc, SupportChatLabels labels) {
        this.jdbc = jdbc;
        this.labels = labels;
    }

    Row row(UUID userId, SupportChatScope scope) {
        MapSqlParameterSource params = new MapSqlParameterSource("user", userId);
        SupportChatLabels.Resolver names = labels.resolver();
        return jdbc.query("select * from (" + relation(scope, params, true) + ") r", params,
                (rs, i) -> map(rs, names)).stream().findFirst().orElse(null);
    }

    Page<Row> list(AuthPrincipal caller, SupportChatScope scope, String view, String context, Pageable pageable) {
        MapSqlParameterSource params = new MapSqlParameterSource("caller", caller.userId());
        List<String> where = new ArrayList<>();
        switch (view == null ? "all" : view) {
            case "awaiting" -> where.add("r.status = 'awaiting'");
            case "mine" -> where.add(mine(scope, "r."));
            default -> {
            }
        }
        if (context != null && !context.isBlank()) {
            if ("flatmate".equals(context)) {
                where.add("r.last_about_type in ('flatmate_room', 'flatmate_group', 'flatmate_post')");
            } else {
                where.add("r.last_about_type = :context");
                params.addValue("context", context);
            }
        }
        String source = "(" + relation(scope, params, false) + ") r";
        String clause = where.isEmpty() ? "" : " where " + String.join(" and ", where);
        Long total = jdbc.queryForObject("select count(*) from " + source + clause, params, Long.class);
        params.addValue("limit", pageable.getPageSize()).addValue("offset", pageable.getOffset());
        SupportChatLabels.Resolver names = labels.resolver();
        List<Row> rows = jdbc.query("select * from " + source + clause
                + " order by r.last_at desc, r.user_id limit :limit offset :offset", params, (rs, i) -> map(rs, names));
        return new PageImpl<>(rows, pageable, total == null ? 0 : total);
    }

    Counts counts(AuthPrincipal caller, SupportChatScope scope) {
        MapSqlParameterSource params = new MapSqlParameterSource("caller", caller.userId());
        return jdbc.queryForObject("select count(*) filter (where r.status = 'awaiting'), count(*) filter (where "
                + mine(scope, "r.") + "), count(*) from (" + relation(scope, params, false) + ") r", params,
                (rs, i) -> new Counts(rs.getLong(1), rs.getLong(2), rs.getLong(3), scope.dto()));
    }

    private static String mine(SupportChatScope scope, String alias) {
        return scope.full() ? alias + "assignee_id = :caller and " + alias + "status <> 'resolved'" : "false";
    }

    private static String relation(SupportChatScope scope, MapSqlParameterSource params, boolean oneUser) {
        if (scope.full()) {
            return FULL + (oneUser ? " where c.user_id = :user" : "");
        }
        String filter = scope.about("t.about_type", "t.about_id", params) + (oneUser ? " and t.user_id = :user" : "");
        return SCOPED.formatted(filter);
    }

    private static Row map(ResultSet rs, SupportChatLabels.Resolver names) throws SQLException {
        UUID assignee = rs.getObject("assignee_id", UUID.class);
        String type = rs.getString("last_about_type");
        String id = rs.getString("last_about_id");
        return new Row(rs.getObject("user_id", UUID.class), rs.getString("name"), rs.getString("status"),
                assignee == null ? null : new Person(assignee, rs.getString("assignee_name")),
                rs.getBoolean("staff_unread"), rs.getObject("last_at", OffsetDateTime.class).toInstant(),
                rs.getString("last_preview"), rs.getString("last_from"),
                new SupportChatDto.About(type, id, names.label(type, id)));
    }
}
