package com.draazy.api.engagement.flatmate;

/** What the flat owner sees on the confirm page: a first name and the room, never a phone number.
 * {@code homeSaved} is true once the flat is in their own account, so the page can offer to open it. */
public record FlatmateOwnerNoticeView(String tenantName, String society, String locality,
        String roomType, Long rent, String status, boolean homeSaved) {
}