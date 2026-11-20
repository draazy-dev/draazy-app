package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.util.UUID;

public record GroupApplicationDto(
        UUID id,
        UUID listingId,
        String listingTitle,
        String locality,
        Long rent,
        Long perHead,
        String groupTitle,
        String applicantName,
        String applicantMobile,
        int members,
        int seatsTotal,
        String status,
        String modStatus,
        Instant at) {
    static GroupApplicationDto of(FlatmateGroupApplication application, String listingTitle,
            String locality, Long rent, String groupTitle, String applicantName, String applicantMobile,
            int members, int seatsTotal) {
        return new GroupApplicationDto(
                application.getId(),
                application.getListingId(),
                listingTitle,
                locality,
                rent,
                rent == null || seatsTotal <= 0 ? rent : rent / seatsTotal,
                groupTitle,
                applicantName,
                applicantMobile,
                members,
                seatsTotal,
                application.getStatus(),
                application.getModStatus(),
                application.getCreatedAt());
    }
}
