package com.draazy.api.catalog.property;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PropertyResponse(
        String id,
        String slug,
        String title,
        String deal,
        String propertyType,
        BigDecimal bhk,
        Long price,
        String priceUnit,
        BigDecimal area,
        String areaUnit,
        String furnishing,
        String locality,
        String localitySlug,

        String societySlug,
        String societyName,
        String city,
        Double lat,
        Double lng,
        String coverImage,
        boolean verified,
        String status,

        ListingProgress progress,

        String dealStatus,
        Instant createdAt,

        Instant lastConfirmedAt,
        Instant resubmittedAt,

        Instant ownershipRequestedAt,
        String ownershipDeclinedReason,

        Integer qualityScore,
        String freshness,

        String landUse,
        Integer ageYears,
        String room,
        List<String> tenants,
        String availableFrom,
        LocalDate availableOn,
        String availableDate,
        Boolean pets,

        String description,
        Long deposit,
        Long maintenance,
        Boolean negotiable,
        String ownership,
        Boolean loanAvailable,
        String agreementDuration,

        String lockIn,
        String noticePeriod,
        String foodPref,

        String bestTimeToCall,
        List<String> furniture,
        String reraId,
        BigDecimal carpetArea,
        BigDecimal builtUpArea,
        BigDecimal superBuiltUpArea,
        Integer floor,
        Integer totalFloors,
        String facing,
        String overlooking,

        Integer bathrooms,
        Integer parking,
        Integer balconies,
        String possession,
        List<String> amenities,
        List<String> images,
        String floorPlan,
        String video,

        String address,
        String pincode,
        String societyId,

        Map<String, Object> formDetails,

        String electricityMeterNo,
        int views,
        int enquiries,
        Boolean featured,

        String flagReason,

        Boolean recheckPending,

        String recheckReason,

        List<Map<String, String>> recheckChanges,

        Instant recheckRequestedAt,

        Boolean archived,
        boolean ownerVerified,
        boolean ownershipVerified,
        int docsCount,
        Owner owner,

        Commercial commercial,

        Land land,

        AdminPipeline adminPipeline) {
    public record AdminPipeline(
            boolean postedByAdmin,
            String postedByStaff,
            int reminderCount) {
    }

    public record Owner(String id, String name, String mobile, boolean verified) {
        public Owner {
            Objects.requireNonNull(id, "owner id");
        }
    }

    public record Commercial(
            String commercialType,
            String shellType,
            String washrooms,
            String camCharges,
            Boolean powerBackup,
            Boolean pantry,
            List<String> suitableFor,
            List<String> fixtures,
            String fitOutMonths,
            String escalationPct,
            String tenancyStatus,
            String inPlaceRent,
            String leaseExpiry,
            String seatCount,
            String frontage,
            String floorLoad,
            String clearHeight,
            String sanctionedPower,
            String dockCount) {
    }

    public record Land(
            String plotZone,
            String waterSource,
            String naStatus,
            String otherRights,
            String buyerEligibility,
            String openSides,
            String roadWidth,
            String plotLength,
            String plotWidth,
            Boolean cornerPlot,
            Boolean boundaryWall,
            Boolean naSanctioned,
            Boolean electricity,
            Boolean roadAccess,
            Boolean satbara) {
    }
}
