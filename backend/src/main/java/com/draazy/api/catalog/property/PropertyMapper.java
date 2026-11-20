package com.draazy.api.catalog.property;

import com.draazy.api.catalog.listing.ListingCreate;
import com.draazy.api.catalog.listing.ListingWriteResult;
import com.draazy.api.catalog.listing.OwnerListingCard;
import com.draazy.api.common.trust.BackOfficeVisibility;
import com.draazy.api.common.trust.ContactVisibility;
import com.draazy.api.common.trust.FlagReasonVisibility;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.trust.OutreachCounts;
import com.draazy.api.common.trust.PrivateFieldVisibility;
import com.draazy.api.identity.user.User;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.mapstruct.BeanMapping;
import org.mapstruct.Context;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface PropertyMapper {
    String FRESHNESS = "java(Freshness.of(property.getLastConfirmedAt(), property.getCreatedAt(),"
            + " java.time.Instant.now()).wire())";

    String COVER = "java(coverImage(property))";

    String OWN_SIDE = "java(privateFields == com.draazy.api.common.trust.PrivateFieldVisibility.VISIBLE ? ";

    List<String> LAND_KEYS = List.of("plotZone", "waterSource", "naStatus", "otherRights",
            "buyerEligibility", "openSides", "roadWidth", "plotLength", "plotWidth", "cornerPlot",
            "boundaryWall", "naSanctioned", "electricity", "roadAccess", "satbara");

    @Mapping(target = "coverImage", expression = COVER)
    PropertySummary toSummary(Property property);

    @Mapping(target = "coverImage", expression = COVER)
    @Mapping(target = "images", expression = "java(leadPhotos(property, PropertyCard.MAX_PHOTOS))")
    PropertyCard toCard(Property property);

    @Mapping(target = "coverImage", expression = COVER)
    @Mapping(target = "available", expression = "java(property.isPubliclyVisible())")
    SavedCard toSaved(Property property, Instant savedAt);

    @Mapping(target = "coverImage", expression = COVER)
    @Mapping(target = "progress", expression = "java(ListingProgress.of(property, false))")
    @Mapping(target = "freshness", expression = FRESHNESS)
    @Mapping(target = "archivedNote", expression = "java(archivedNote(property))")
    @Mapping(target = "pendingLeads", expression = "java(pendingLeads.getOrDefault(property.getId(), 0))")
    @Mapping(target = "photoCount", expression = "java(photoCount(property))")
    @Mapping(target = "descLength", expression = "java(property.getDescription() == null ? 0"
            + " : property.getDescription().length())")
    @Mapping(target = "amenityCount", expression = "java(property.getAmenities() == null ? 0"
            + " : property.getAmenities().size())")
    OwnerListingCard toOwnerCard(Property property, @Context Map<UUID, Integer> pendingLeads);

    @Mapping(target = "archived", ignore = true)
    ListingWriteResult toWriteResult(Property property);

    @Mapping(target = "archived", expression = "java((Boolean) property.isArchived())")
    ListingWriteResult toTakenDown(Property property);

    @Mapping(target = "coverImage", expression = COVER)
    PropertyCompare toCompare(Property property);

    SearchIndexEntry toIndexEntry(Property property);

    @Mapping(target = "photos", expression = "java(leadPhotos(property, PropertyReel.MAX_PHOTOS))")
    PropertyReel toReel(Property property);

    @Mapping(target = "coverImage", expression = COVER)
    @Mapping(target = "distanceKm", expression = "java(Double.isFinite(km) ? km : null)")
    SimilarListing toSimilar(Property property, double km);

    @Mapping(target = "adminPipeline", expression = "java(toAdminPipeline(property, backOffice, outreach))")
    @Mapping(target = "progress", expression = "java(toProgress(property, backOffice, privateFields))")
    @Mapping(target = "coverImage", expression = COVER)
    @Mapping(target = "freshness", expression = FRESHNESS)
    @Mapping(target = "flagReason",
            expression = "java(flagReason == com.draazy.api.common.trust.FlagReasonVisibility.VISIBLE"
                    + " ? property.getFlagReason() : null)")
    @Mapping(target = "electricityMeterNo", expression = OWN_SIDE + "property.getElectricityMeterNo() : null)")
    @Mapping(target = "address", expression = OWN_SIDE + "property.getAddress() : null)")
    @Mapping(target = "formDetails", expression = OWN_SIDE + "property.getFormDetails() : null)")
    @Mapping(target = "resubmittedAt", expression = OWN_SIDE + "property.getResubmittedAt() : null)")
    @Mapping(target = "ownershipRequestedAt", expression = OWN_SIDE + "property.getOwnershipRequestedAt() : null)")
    @Mapping(target = "ownershipDeclinedReason",
            expression = OWN_SIDE + "property.getOwnershipDeclinedReason() : null)")
    @Mapping(target = "recheckPending", expression = OWN_SIDE + "(Boolean) property.isRecheckPending() : null)")
    @Mapping(target = "recheckReason", expression = OWN_SIDE + "property.getRecheckReason() : null)")
    @Mapping(target = "recheckChanges",
            expression = "java(backOffice == BackOfficeVisibility.VISIBLE ? property.getRecheckChanges() : null)")
    @Mapping(target = "recheckRequestedAt", expression = OWN_SIDE + "property.getRecheckRequestedAt() : null)")
    @Mapping(target = "archived", expression = OWN_SIDE + "(Boolean) property.isArchived() : null)")
    @Mapping(target = "featured", expression = OWN_SIDE + "(Boolean) property.isFeatured() : null)")
    @Mapping(target = "qualityScore", expression = OWN_SIDE
            + "(property.getQualityScore() == null ? null : property.getQualityScore().intValue()) : null)")
    @Mapping(target = "societyId",
            expression = OWN_SIDE + "(property.getSocietyId() == null ? null : property.getSocietyId().toString()) : null)")
    @Mapping(target = "pincode", expression = OWN_SIDE + "property.getPincode() : null)")
    @Mapping(target = "ownership", expression = "java(formDetailText(property, \"ownership\"))")
    @Mapping(target = "loanAvailable", expression = "java(formDetailBoolean(property, \"loanAvailable\"))")
    @Mapping(target = "agreementDuration", expression = "java(formDetailText(property, \"agreementDuration\"))")
    @Mapping(target = "lockIn", expression = "java(formDetailText(property, \"lockIn\"))")
    @Mapping(target = "noticePeriod", expression = "java(formDetailText(property, \"noticePeriod\"))")
    @Mapping(target = "foodPref", expression = "java(foodPref(property))")
    @Mapping(target = "bestTimeToCall", expression = "java(formDetailText(property, \"bestTimeToCall\"))")
    @Mapping(target = "availableDate",
            expression = "java(property.getAvailableOn() == null ? null : property.getAvailableOn().toString())")
    @Mapping(target = "furniture", expression = "java(formDetailStrings(property, \"furniture\"))")
    @Mapping(target = "commercial", expression = "java(toCommercial(property))")
    @Mapping(target = "land", expression = "java(toLand(property))")
    PropertyResponse toResponse(Property property, @Context ContactVisibility visibility,
            @Context BackOfficeVisibility backOffice, @Context OutreachCounts outreach,
            @Context PrivateFieldVisibility privateFields,
            @Context FlagReasonVisibility flagReason);

    default PropertyResponse toResponse(Property property, ContactVisibility visibility,
            BackOfficeVisibility backOffice, OutreachCounts outreach,
            PrivateFieldVisibility privateFields) {
        return toResponse(property, visibility, backOffice, outreach, privateFields,
                backOffice == BackOfficeVisibility.VISIBLE
                        ? FlagReasonVisibility.VISIBLE : FlagReasonVisibility.HIDDEN);
    }

    @BeanMapping(ignoreByDefault = true,
            nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
    @Mapping(target = "bhk", source = "bhk")
    @Mapping(target = "deposit", source = "deposit")
    @Mapping(target = "maintenance", source = "maintenance")
    @Mapping(target = "negotiable", source = "negotiable")
    @Mapping(target = "area", source = "area")
    @Mapping(target = "carpetArea", source = "carpetArea")
    @Mapping(target = "builtUpArea", source = "builtUpArea")
    @Mapping(target = "superBuiltUpArea", source = "superBuiltUpArea")
    @Mapping(target = "pets", source = "pets")
    @Mapping(target = "pincode", source = "pincode")
    @Mapping(target = "formDetails", source = "formDetails")
    @Mapping(target = "areaUnit", source = "areaUnit")
    @Mapping(target = "landUse", source = "landUse")
    @Mapping(target = "furnishing", source = "furnishing")
    @Mapping(target = "lat", source = "lat")
    @Mapping(target = "lng", source = "lng")
    @Mapping(target = "reraId", source = "reraId")
    @Mapping(target = "possession", source = "possession")
    @Mapping(target = "tenants", source = "tenants")
    @Mapping(target = "amenities", source = "amenities")
    @Mapping(target = "images", source = "images")

    @Mapping(target = "floorPlan",
            expression = "java(in.floorPlan() == null || in.floorPlan().isBlank() ? null : in.floorPlan())")
    @Mapping(target = "video",
            expression = "java(in.video() == null || in.video().isBlank() ? null : in.video())")
    @Mapping(target = "description", source = "description")
    @Mapping(target = "address", source = "address")
    @Mapping(target = "floor", source = "floor")

    // A ListingCreate field without a mapping line is dropped silently: it compiles, no test
    // fails, POST returns 201. Add both in the same edit.
    @Mapping(target = "bathrooms", source = "bathrooms")
    @Mapping(target = "parking", source = "parking")
    @Mapping(target = "balconies", source = "balconies")
    @Mapping(target = "facing", source = "facing")
    @Mapping(target = "overlooking", source = "overlooking")
    @Mapping(target = "totalFloors", source = "totalFloors")
    @Mapping(target = "ageYears", source = "ageYears")
    @Mapping(target = "societyId", source = "societyId")
    @Mapping(target = "electricityMeterNo", source = "electricityMeterNo")
    void applyTo(ListingCreate in, @MappingTarget Property property);

    // Trust boundary: owner mobile stays masked unless the gate status is REVEALED. Kept explicit
    // so a DTO refactor cannot drop the masking.
    default PropertyResponse.Owner toOwner(User owner, @Context ContactVisibility visibility) {
        if (owner == null) {
            return null;
        }
        String mobile = visibility == ContactVisibility.REVEALED
                ? owner.getMobile()
                : maskMobile(owner.getMobile());
        return new PropertyResponse.Owner(
                owner.getId().toString(), owner.getName(), mobile, owner.isVerified());
    }

    default String map(UUID value) {
        return value == null ? null : value.toString();
    }

    default String formDetailText(Property property, String key) {
        Object value = formDetail(property, key);
        return value instanceof String text ? text : null;
    }

    default String foodPref(Property property) {
        String food = formDetailText(property, "food");
        return food != null ? food : formDetailText(property, "foodPref");
    }

    default Boolean formDetailBoolean(Property property, String key) {
        Object value = formDetail(property, key);
        return value instanceof Boolean flag ? flag : null;
    }

    default List<String> formDetailStrings(Property property, String key) {
        Object value = formDetail(property, key);
        if (!(value instanceof List<?> values) || !values.stream().allMatch(String.class::isInstance)) {
            return null;
        }
        return values.stream().map(String.class::cast).toList();
    }

    private Object formDetail(Property property, String key) {
        return property.getFormDetails() == null ? null : property.getFormDetails().get(key);
    }

    private static boolean answered(Object value) {
        return value instanceof Boolean flag ? flag : value instanceof String text && !text.isBlank();
    }

    default PropertyResponse.Commercial toCommercial(Property property) {
        if (formDetail(property, "commercialType") == null) {
            return null;
        }
        return new PropertyResponse.Commercial(
                formDetailText(property, "commercialType"),
                formDetailText(property, "shellType"),
                formDetailText(property, "washrooms"),
                formDetailText(property, "camCharges"),
                formDetailBoolean(property, "powerBackup"),
                formDetailBoolean(property, "pantry"),
                formDetailStrings(property, "suitableFor"),
                formDetailStrings(property, "fixtures"),
                formDetailText(property, "fitOutMonths"),
                formDetailText(property, "escalationPct"),
                formDetailText(property, "tenancyStatus"),
                formDetailText(property, "inPlaceRent"),
                formDetailText(property, "leaseExpiry"),
                formDetailText(property, "seatCount"),
                formDetailText(property, "frontage"),
                formDetailText(property, "floorLoad"),
                formDetailText(property, "clearHeight"),
                formDetailText(property, "sanctionedPower"),
                formDetailText(property, "dockCount"));
    }

    default PropertyResponse.Land toLand(Property property) {
        if (LAND_KEYS.stream().noneMatch(key -> answered(formDetail(property, key)))) {
            return null;
        }
        return new PropertyResponse.Land(
                formDetailText(property, "plotZone"),
                formDetailText(property, "waterSource"),
                formDetailText(property, "naStatus"),
                formDetailText(property, "otherRights"),
                formDetailText(property, "buyerEligibility"),
                formDetailText(property, "openSides"),
                formDetailText(property, "roadWidth"),
                formDetailText(property, "plotLength"),
                formDetailText(property, "plotWidth"),
                formDetailBoolean(property, "cornerPlot"),
                formDetailBoolean(property, "boundaryWall"),
                formDetailBoolean(property, "naSanctioned"),
                formDetailBoolean(property, "electricity"),
                formDetailBoolean(property, "roadAccess"),
                formDetailBoolean(property, "satbara"));
    }

    default String archivedNote(Property property) {
        String reason = property.getArchiveReason();
        return property.isArchived() && reason != null
                && reason.startsWith(com.draazy.api.catalog.listing.ListingArchiveService.DUPLICATE_REASON)
                ? "Archived as a duplicate of another listing." : null;
    }

    default String coverImage(Property property) {
        String stored = property.getCoverImage();
        if (stored != null && !stored.isBlank()) {
            return stored;
        }
        var images = property.getImages();
        return images == null || images.isEmpty() ? null : images.get(0);
    }

    default List<String> leadPhotos(Property property, int max) {
        var images = property.getImages();
        return images == null ? List.of() : images.stream().limit(max).toList();
    }

    default int photoCount(Property property) {
        var images = property.getImages();
        if (images != null && !images.isEmpty()) {
            return images.size();
        }
        return coverImage(property) == null ? 0 : 1;
    }

    default PropertyResponse.AdminPipeline toAdminPipeline(Property property,
            @Context BackOfficeVisibility backOffice, @Context OutreachCounts outreach) {
        if (backOffice != BackOfficeVisibility.VISIBLE || property == null
                || !property.isPostedByAdmin()) {
            return null;
        }
        return new PropertyResponse.AdminPipeline(
                true,
                property.getPostedByStaff(),
                outreach.forSubject(property.getId()));
    }

    default ListingProgress toProgress(Property property, @Context BackOfficeVisibility backOffice,
            @Context PrivateFieldVisibility privateFields) {
        return privateFields == PrivateFieldVisibility.VISIBLE
                ? ListingProgress.of(property, backOffice == BackOfficeVisibility.VISIBLE) : null;
    }

    // Anything that is not a clean 10-digit number becomes null, never a partial leak. Private so
    // MapStruct cannot apply it to other String fields.
    private String maskMobile(String mobile) {
        return MobileMask.mask(mobile);
    }
}
