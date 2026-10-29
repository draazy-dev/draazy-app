package com.draazy.api.security;

import java.util.UUID;

public record AuthPrincipal(
        UUID userId,
        String role,
        String team,
        boolean mobileVerified,
        boolean verified) {
}
