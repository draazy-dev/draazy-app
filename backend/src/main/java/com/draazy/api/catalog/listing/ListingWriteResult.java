package com.draazy.api.catalog.listing;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ListingWriteResult(
        String id,
        String slug,
        String status,
        Boolean archived,
        boolean recheckPending,
        String recheckReason,
        Instant recheckRequestedAt) {
}
