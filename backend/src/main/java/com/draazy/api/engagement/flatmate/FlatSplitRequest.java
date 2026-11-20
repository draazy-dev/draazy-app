package com.draazy.api.engagement.flatmate;

import static com.draazy.api.engagement.flatmate.FlatmateVocabulary.NO_CONTACT;

import com.draazy.api.catalog.listing.NoContactDetails;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.util.List;

public record FlatSplitRequest(
        @NotNull @Min(1) @Max(36) Integer maxOccupants,
        @NotEmpty @Size(max = 12) List<@Valid @NotNull RoomSpec> rooms) {
    public record RoomSpec(
            @NotBlank String roomKind,
            @NotNull @Min(1) @Max(10_000_000) Long rent,
            @Min(0) @Max(20_000_000) Long deposit,
            @Size(max = 600) @NoContactDetails(message = NO_CONTACT) String note) {
    }
}
