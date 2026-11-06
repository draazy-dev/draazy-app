package com.draazy.api.services.support;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record SupportTicketAbout(
        @NotBlank @Pattern(regexp = "property|flatmate_room|flatmate_group|flatmate_post|invoice") String type,
        @NotBlank @Size(max = 64) String id) {
}
