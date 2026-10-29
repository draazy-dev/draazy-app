package com.draazy.api.moderation.property;

import com.draazy.api.catalog.listing.ListingCreate;
import com.draazy.api.common.validation.IndianMobile;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record OnBehalfListingRequest(
        @NotBlank @IndianMobile String ownerMobile,
        @Size(max = 120) String ownerName,
        @NotNull @Valid ListingCreate listing) {
}
