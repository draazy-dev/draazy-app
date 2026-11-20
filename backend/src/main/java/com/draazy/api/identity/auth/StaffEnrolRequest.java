package com.draazy.api.identity.auth;

import jakarta.validation.constraints.NotBlank;

public record StaffEnrolRequest(@NotBlank String challenge) {
}
