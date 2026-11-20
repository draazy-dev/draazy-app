package com.draazy.api.moderation.user;

import java.time.Instant;
import java.util.List;

public record TeamMemberResponse(
        String id,
        String name,
        String mobile,
        String email,
        String role,
        String status,
        boolean archived,
        Instant createdAt,
        List<String> functions) {
}
