package com.draazy.api.services.support;

import java.time.Instant;

/** No thread inline (that is {@code GET /support/tickets/{id}}), so a page of the whole queue stays bounded.
 * {@code awaitingReply}: customer message unread by staff; {@code unread}: staff reply unread by the customer. */
public record AdminSupportTicketDto(
        String id,
        String subject,
        String category,
        String status,
        String raiser,
        String raiserMobile,
        boolean awaitingReply,
        boolean unread,
        Instant createdAt) {
}
