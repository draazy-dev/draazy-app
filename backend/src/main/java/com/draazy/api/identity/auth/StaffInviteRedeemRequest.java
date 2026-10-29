package com.draazy.api.identity.auth;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.nio.charset.StandardCharsets;

public record StaffInviteRedeemRequest(
        @NotBlank String token,
        @NotBlank @Size(min = 12, max = 72) String password) {
    @JsonIgnore
    @AssertTrue(message = "must be at most 72 bytes")
    public boolean isPasswordWithinBcryptLimit() {
        return password == null || password.getBytes(StandardCharsets.UTF_8).length <= 72;
    }
}
