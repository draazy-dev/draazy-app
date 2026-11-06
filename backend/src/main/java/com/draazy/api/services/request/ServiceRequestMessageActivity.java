package com.draazy.api.services.request;

import com.draazy.api.common.trust.SupportActivity;
import com.draazy.api.common.trust.SupportActivity.Side;
import com.draazy.api.security.Roles;
import jakarta.persistence.PostPersist;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Component;

/** A request's thread is the requester's chat about that request. */
@Component
public class ServiceRequestMessageActivity {
    private final NamedParameterJdbcTemplate jdbc;
    private final ApplicationEventPublisher events;

    public ServiceRequestMessageActivity(NamedParameterJdbcTemplate jdbc, ApplicationEventPublisher events) {
        this.jdbc = jdbc;
        this.events = events;
    }

    @PostPersist
    void persisted(ServiceRequestMessage message) {
        List<UUID> requester = jdbc.query(
                "select requester_id from service_requests where id = :id and requester_id is not null",
                new MapSqlParameterSource("id", message.getRequestId()),
                (rs, row) -> rs.getObject("requester_id", UUID.class));
        if (requester.isEmpty()) {
            return;
        }
        boolean fromStaff = Roles.isBackOffice(message.getAuthorRole());
        Instant at = message.getCreatedAt() == null ? Instant.now() : message.getCreatedAt();
        events.publishEvent(new SupportActivity(requester.get(0), fromStaff ? Side.STAFF : Side.USER,
                fromStaff ? message.getAuthorId() : null, "request", message.getRequestId().toString(),
                message.getBody(), at));
    }
}
