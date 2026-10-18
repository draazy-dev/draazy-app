package com.draazy.api.engagement.flatmate;

import java.time.Instant;
import java.util.UUID;

/** Titles and rent are joined from the listing, not stored on the row, so no screen shows a stale price.
 * {@code status} is the owner's call (admin never writes it); {@code applicantMobile} is null in the owner's inbox. */
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
                // Per head is what each applicant actually pays, computed on read so it can never
                // disagree with the listing's rent.
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
