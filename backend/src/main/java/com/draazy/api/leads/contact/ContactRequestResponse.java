package com.draazy.api.leads.contact;

import java.time.Instant;

// `requester` always carries a masked mobile; `contact` holds the raw one only once the owner approves.
public record ContactRequestResponse(
        String id,
        String propertyId,
        Party requester,
        String status,
        Contact contact,
        String message,
        Instant createdAt) {

    // `verified` rides on the party because the masked mobile can never be matched client-side.
    public record Party(String name, String mobile, String role, boolean verified) {
    }

    public record Contact(String name, String mobile) {
    }
}
