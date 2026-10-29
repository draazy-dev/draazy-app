package com.draazy.api.services.support;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SupportTicketCreate(
        @NotBlank @Size(max = 200) String subject,
        @Size(max = 64) String category,
        @NotBlank @Size(max = 4000) String body) {
}
