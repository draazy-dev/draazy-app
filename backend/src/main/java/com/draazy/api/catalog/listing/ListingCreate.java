package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.property.AreaUnit;
import com.draazy.api.catalog.property.AvailableOn;
import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.catalog.property.Furnishing;
import com.draazy.api.catalog.property.LandUse;
import com.draazy.api.catalog.property.PropertyPossession;
import com.draazy.api.catalog.property.PropertyTypeLabel;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

// Server-owned fields (status, owner, priceUnit, badges, counters) stay out of this record
// so a POST cannot spoof them.
@CoherentDimensions
@ListingSanityLimits
public record ListingCreate(

        @NotBlank @Size(max = 200) @NoContactDetails String title,
        @NotNull @Pattern(regexp = DealIntent.PATTERN, message = DealIntent.PATTERN_MESSAGE) String deal,

        @NotBlank @Size(max = 80) @Pattern(regexp = PropertyTypeLabel.PATTERN,
                message = PropertyTypeLabel.PATTERN_MESSAGE) String propertyType,
        BigDecimal bhk,
        @NotNull @Positive Long price,

        @PositiveOrZero Long deposit,
        @PositiveOrZero Long maintenance,
        Boolean negotiable,
        @Positive BigDecimal area,
        @Pattern(regexp = AreaUnit.PATTERN, message = AreaUnit.PATTERN_MESSAGE) String areaUnit,
        @Pattern(regexp = Furnishing.PATTERN,
                message = Furnishing.PATTERN_MESSAGE) String furnishing,
        @NotBlank String locality,
        String localitySlug,
        @NotBlank String city,
        @DecimalMin(value = "-90", message = "must be between -90 and 90") @DecimalMax(value = "90", message = "must be between -90 and 90") Double lat,
        @DecimalMin(value = "-180", message = "must be between -180 and 180") @DecimalMax(value = "180", message = "must be between -180 and 180") Double lng,

        @Pattern(regexp = "^$|^P[0-9]{11}$",
                message = "must be a MahaRERA id: P followed by 11 digits") String reraId,
        @Pattern(regexp = PropertyPossession.PATTERN,
                message = PropertyPossession.PATTERN_MESSAGE) String possession,

        @Size(max = 5) List<@NotNull @Pattern(regexp = "family|bachelors|bachelor-male|bachelor-female|company|anyone", message = "must be family, bachelors, bachelor-male, bachelor-female, company or anyone") String> tenants,

        @Size(max = 40) List<@NotNull @Size(max = 60) @NoContactDetails String> amenities,

        @Size(max = 20, message = "cannot carry more than 20 photos")
        List<@NotNull @Size(max = 512) String> images,

        @Size(max = 512) String floorPlan,
        @Pattern(regexp = "^$|^[A-Za-z0-9_-]{11}$", message = "must be an 11-character YouTube video id") String video,
        @Size(max = 4000) @NoContactDetails String description,

        @Size(max = 300) @NoContactDetails String address,
        @Min(value = 0, message = "cannot be below the ground floor") Integer floor,

        UUID societyId,
        @Size(max = 64) String electricityMeterNo,

        @Min(0) Integer bathrooms,
        @Min(0) Integer parking,
        @Min(0) Integer balconies,

        @Size(max = 32) String facing,

        @Size(max = 32) String overlooking,
        @Min(1) Integer totalFloors,

        @Min(0) Integer ageYears,
        @Pattern(regexp = "^$|^[1-9][0-9]{5}$", message = "must be a 6-digit pincode") String pincode,
        @Positive BigDecimal carpetArea,
        @Positive BigDecimal builtUpArea,
        @Positive BigDecimal superBuiltUpArea,

        @Pattern(regexp = "^$|now|15|30", message = "must be now, 15 or 30") String availableFrom,
        @Pattern(regexp = AvailableOn.PATTERN, message = AvailableOn.PATTERN_MESSAGE) String availableOn,

        Boolean pets,
        @ListingFormDetails Map<String, Object> formDetails,

        @Pattern(regexp = LandUse.PATTERN, message = LandUse.PATTERN_MESSAGE)
        String landUse) implements CoherentDimensions.Dimensions, ListingSanityLimits.Input {
    public ListingCreate {
        images = images == null ? null : images.stream().distinct().toList();
    }
}
