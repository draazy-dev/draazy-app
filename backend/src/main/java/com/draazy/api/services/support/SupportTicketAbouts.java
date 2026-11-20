package com.draazy.api.services.support;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import java.util.Map;
import java.util.UUID;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** Who may open a support thread about what: their own listing, flatmate post or invoice, or any live listing. */
@Component
class SupportTicketAbouts {
    private static final Map<String, String> OWNED = Map.of(
            "property", "select 1 from properties where id = :id and (owner_id = :user"
                    + " or (status = 'approved' and archived = false))",
            "flatmate_room", "select 1 from flatmate_rooms where id = :id and host_id = :user",
            "flatmate_group", "select 1 from flatmate_groups where id = :id and host_id = :user",
            "flatmate_post", "select 1 from flatmate_seeker_posts where id = :id and user_id = :user");

    private final NamedParameterJdbcTemplate jdbc;

    SupportTicketAbouts(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Not-found rather than forbidden, so the check is no oracle for which ids exist. */
    SupportTicketAbout check(UUID caller, SupportTicketAbout about) {
        if ("invoice".equals(about.type())) {
            require(!jdbc.queryForList("select 1 from invoices where number = :id and user_id = :user",
                    Map.of("id", about.id(), "user", caller)).isEmpty());
            return about;
        }
        UUID id = Ids.parseUuid(about.id()).orElseThrow(() -> NotFoundException.of("Support subject"));
        require(!jdbc.queryForList(OWNED.get(about.type()), Map.of("id", id, "user", caller)).isEmpty());
        return new SupportTicketAbout(about.type(), id.toString());
    }

    private static void require(boolean found) {
        if (!found) {
            throw NotFoundException.of("Support subject");
        }
    }
}
