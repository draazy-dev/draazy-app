package com.draazy.api.leads.contact;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record StatusUpdate(
        @NotBlank @Pattern(regexp = ContactRequestStatuses.RESPONSE_PATTERN) String status,
        @Size(max = 500) String note) {
}
