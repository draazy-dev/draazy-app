package com.draazy.api.services.ticket;

import jakarta.validation.constraints.Size;

public record TicketUpdate(
        @Size(max = 16) String status,
        @Size(max = 16) String priority,
        @Size(max = 64) String assigneeId,
        @Size(max = 32) String team) {
    public static final String UNASSIGN = "none";

    public boolean unassigns() {
        return assigneeId != null && UNASSIGN.equals(assigneeId.trim());
    }
}
