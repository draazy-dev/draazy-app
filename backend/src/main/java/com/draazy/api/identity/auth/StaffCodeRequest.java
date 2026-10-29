package com.draazy.api.identity.auth;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StaffCodeRequest(
        @NotBlank String challenge,
        @NotBlank @Size(max = 32) String code,
        Boolean remember) {
    public boolean rememberDevice() {
        return remember == null || remember;
    }
}
