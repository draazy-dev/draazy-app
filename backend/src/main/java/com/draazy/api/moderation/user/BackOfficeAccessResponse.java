package com.draazy.api.moderation.user;

import java.util.List;

public record BackOfficeAccessResponse(
        String userId,
        String role,
        boolean scoped,
        List<String> functions,
        List<String> permissions,
        List<String> effective,
        List<String> desks) {
}
