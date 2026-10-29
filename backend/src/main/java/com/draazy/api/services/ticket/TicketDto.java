package com.draazy.api.services.ticket;

import java.time.Instant;
import java.util.List;

public record TicketDto(
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
        List<Note> notes,
        Instant createdAt) {
    public record Note(String by, String text, Instant at) {
    }
}
