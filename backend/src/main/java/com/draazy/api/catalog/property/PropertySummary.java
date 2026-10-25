package com.draazy.api.catalog.property;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Card projection for lists: only what the grid, map pins, owner profile and shortlist draw, with no owner
 * contact since the gate is on the detail path. Facets filter server-side via {@link ListingFacets}. */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PropertySummary(
        String id,
        String slug,
        String title,
        String deal,
        String propertyType,
        BigDecimal bhk,
        Long price,

        /** Rent only; in Pune it runs to several months' rent, so a renter weighs it beside the rent itself. */
        Long deposit,
        BigDecimal area,
        String areaUnit,
        String furnishing,
        String possession,

        /** Permitted zoning for plots and farm land; null for anything with a building on it. */
        String landUse,

        String room,
        List<String> tenants,
        String availableFrom,
        LocalDate availableOn,
        Boolean pets,

        String locality,
        String localitySlug,
        String societyName,
        String city,
        Double lat,
        Double lng,
        String coverImage,
        boolean verified,
        boolean ownerVerified,
        boolean ownershipVerified,
        String reraId,
        String status,
        String dealStatus,

        /** Editorial promotion, distinct from the paid {@code boosted}. On the card because that is
         * where the badge renders. */
        boolean featured,
        Instant createdAt) {
}
