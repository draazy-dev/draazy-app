package com.draazy.api.services.ticket;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

public record TicketCreate(
        @NotBlank @Size(max = 200) String subject,
        @Size(max = 32) String team,
        @Size(max = 16) String priority,
        @Size(max = 64) String propertyId,
        @Size(max = 4000) String body,
        @PositiveOrZero Long quotedValue) {
}
