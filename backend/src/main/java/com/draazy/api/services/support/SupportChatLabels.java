package com.draazy.api.services.support;

import com.draazy.api.common.web.Ids;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Names a chat subject once, server-side, so neither the user's app nor the desk needs another read. */
@Component
class SupportChatLabels {
    private static final Map<String, String> BY_ID = Map.of(
            "property", "select title from properties where id = :id",
            "flatmate_room", "select coalesce(title, 'Room') from flatmate_rooms where id = :id",
            "flatmate_group", "select title from flatmate_groups where id = :id",
            "flatmate_post", "select coalesce(title, name) from flatmate_seeker_posts where id = :id",
            "request", "select type from service_requests where id = :id",
            "identity", "select category from support_tickets where id = :id");

    private final NamedParameterJdbcTemplate jdbc;

    SupportChatLabels(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    Resolver resolver() {
        return new Resolver(new HashMap<>());
    }

    final class Resolver {
        private final Map<String, String> seen;

        private Resolver(Map<String, String> seen) {
            this.seen = seen;
        }

        String label(String type, String id) {
            if (type == null || id == null) {
                return null;
            }
            return seen.computeIfAbsent(type + ":" + id, key -> lookup(type, id));
        }

        private String lookup(String type, String id) {
            if ("invoice".equals(type)) {
                return id;
            }
            String sql = BY_ID.get(type);
            UUID uuid = Ids.parseUuid(id).orElse(null);
            if (sql == null || uuid == null) {
                return null;
            }
            String raw = jdbc.queryForList(sql, Map.of("id", uuid), String.class).stream()
                    .findFirst().orElse(null);
            return switch (type) {
                case "request" -> raw == null ? null : serviceName(raw) + " #" + id.substring(0, 6);
                case "identity" -> "identity_appeal".equals(raw) ? "Identity appeal" : "Identity dispute";
                default -> raw;
            };
        }
    }

    private static String serviceName(String type) {
        String spaced = type.replace('-', ' ');
        return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }
}
