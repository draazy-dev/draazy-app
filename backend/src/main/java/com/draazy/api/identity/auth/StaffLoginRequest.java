package com.draazy.api.identity.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record StaffLoginRequest(
        @NotBlank @Email String email,
        @NotBlank String password) {
}
