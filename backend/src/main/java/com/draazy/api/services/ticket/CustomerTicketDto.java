package com.draazy.api.services.ticket;

import java.time.Instant;

public record CustomerTicketDto(
        String id,
        String subject,
        String team,
        String priority,
        String status,
        String propertyId,
        String assignee,
        String service,
        String customer,
        String mobile,
        Long value,
        Long quotedValue,
        String detail,
        Instant createdAt) {
}
