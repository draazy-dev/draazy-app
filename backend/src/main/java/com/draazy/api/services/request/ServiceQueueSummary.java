package com.draazy.api.services.request;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ServiceQueueSummary(long toPickUp, long mine, long inProgress, long withCustomer,
        long closed, long overdue, Long openTickets) {
}
