package com.draazy.api.leads.contact;

import java.time.Instant;

public record ContactRequestResponse(
        String id,
        String propertyId,
        Party requester,
        String status,
        Contact contact,
        String message,
        Instant createdAt) {
    public record Party(String name, String mobile, String role, boolean verified) {
    }

    public record Contact(String name, String mobile) {
    }
}
