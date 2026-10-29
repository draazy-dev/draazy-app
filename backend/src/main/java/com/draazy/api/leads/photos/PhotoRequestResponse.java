package com.draazy.api.leads.photos;

import java.time.Instant;

public record PhotoRequestResponse(
        String id,
        String propertyId,
        String propertySlug,
        String propertyTitle,
        Requester requester,
        String status,
        Instant createdAt) {
    public record Requester(String name, String mobile) {
    }
}
