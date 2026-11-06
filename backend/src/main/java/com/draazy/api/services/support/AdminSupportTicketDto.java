package com.draazy.api.services.support;

import java.time.Instant;

public record AdminSupportTicketDto(
        String id,
        String subject,
        String category,
        String status,
        String raiser,
        String raiserMobile,
        boolean awaitingReply,
        boolean unread,
        Instant createdAt,
        SupportTicketAbout about) {
}
