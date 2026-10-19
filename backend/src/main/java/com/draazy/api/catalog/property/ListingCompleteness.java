package com.draazy.api.catalog.property;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

/** The core of {@code list-property/validation.js}, enforced when an owner confirms a staff-posted listing,
 * since the desk wizard asks far less. Address lines and photo categories live in free-form details, so are skipped. */
public final class ListingCompleteness {

    /** Mirrors {@code MIN_PUBLISH_PHOTOS} in the wizard's {@code constants.js}. */
    static final int MIN_PHOTOS = 3;

    private ListingCompleteness() {
    }

    /** Human labels of what is missing, in wizard order; empty when the listing meets the bar. */
    public static List<String> missing(Property p) {
        PropertyKind kind = PropertyKind.of(p.getPropertyType());
        boolean residential = kind != null && kind.isResidential();
        boolean land = kind != null && kind.isLand();
        boolean rent = DealIntent.RENT.equals(p.getDeal());
        List<String> gaps = new ArrayList<>();
        if (!positive(p.getCarpetArea()) && !positive(p.getArea())) {
            gaps.add("area");
        }
        if (residential && p.getBhk() == null) {
            gaps.add("BHK");
        }
        if (residential && p.getBathrooms() == null) {
            gaps.add("bathrooms");
        }
        if (kind == PropertyKind.FLAT && (p.getFloor() == null || p.getTotalFloors() == null)) {
            gaps.add("floor and total floors");
        }
        if (blank(p.getLocalitySlug())) {
            gaps.add("locality");
        }
        if (p.getPincode() == null || !p.getPincode().matches("[1-9]\\d{5}")) {
            gaps.add("pincode");
        }
        if (p.getPrice() == null || p.getPrice() <= 0) {
            gaps.add(rent ? "monthly rent" : "price");
        }
        if (rent && p.getDeposit() == null) {
            gaps.add("deposit");
        }
        if (rent && p.getAvailableOn() == null) {
            gaps.add("available from");
        }
        if (!rent && !land && blank(p.getPossession())) {
            gaps.add("possession status");
        }
        if (p.getImages() == null || p.getImages().size() < MIN_PHOTOS) {
            gaps.add(MIN_PHOTOS + " photos");
        }
        return gaps;
    }

    private static boolean positive(BigDecimal value) {
        return value != null && value.signum() > 0;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
