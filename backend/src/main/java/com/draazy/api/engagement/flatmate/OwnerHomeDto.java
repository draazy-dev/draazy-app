package com.draazy.api.engagement.flatmate;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** A flat the caller owns because a tenant's room in it was confirmed, with those rooms. Never carries the tenant's
 * mobile or surname. */
public record OwnerHomeDto(
        String managedId,
        String publishedListingId,
        String title,
        String society,
        String locality,
        BigDecimal bhk,
        String furnishing,
        List<Room> rooms) {

    public record Room(
            String id,
            String title,
            String roomType,
            Long budget,
            Long deposit,
            String status,
            String modStatus,
            LocalDate availableFrom,
            String photo,
            String tenantFirstName) {
    }
}
