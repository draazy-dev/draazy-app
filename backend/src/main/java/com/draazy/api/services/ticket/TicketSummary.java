package com.draazy.api.services.ticket;

public record TicketSummary(long open, long inProgress, long waiting, long resolved, long closed, long all) {
}
