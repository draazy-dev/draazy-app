package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.property.AreaUnit;
import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyKind;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** What a listing may say about itself given its type and deal. Create, owner edit and staff edit all
 * come through here, so the three cannot disagree on what is storable. */
final class ListingShape {

    static final long MAX_SALE_PRICE = 10_000_000_000L;
    static final long MAX_MONTHLY_RENT = 10_000_000L;
    private static final BigDecimal MAX_AREA_SQFT = BigDecimal.valueOf(10_000).multiply(AreaUnit.sqftPer(AreaUnit.ACRE));

    private static final Set<String> RENT_ONLY_DETAILS = Set.of("agreementDuration", "lockIn", "noticePeriod",
            "foodPref", "food", "petsPolicy", "rentMaintMode", "preferredTenants", "fitOutMonths", "escalationPct");

    record Problem(String field, String message) {
    }

    private ListingShape() {
    }

    static List<Problem> price(String deal, Long price) {
        List<Problem> problems = new ArrayList<>();
        if (price == null) {
            return problems;
        }
        if (DealIntent.BUY.equals(deal) && price > MAX_SALE_PRICE) {
            problems.add(new Problem("price", "cannot exceed Rs. 1,000 crore for a sale listing"));
        }
        if (DealIntent.RENT.equals(deal) && price > MAX_MONTHLY_RENT) {
            problems.add(new Problem("price", "cannot exceed Rs. 1 crore per month"));
        }
        return problems;
    }

    static List<Problem> areaSize(BigDecimal area, String areaUnit) {
        if (area != null && area.multiply(AreaUnit.sqftPer(areaUnit)).compareTo(MAX_AREA_SQFT) > 0) {
            return List.of(new Problem("area", "cannot exceed 10,000 acres"));
        }
        return List.of();
    }

    static List<Problem> areaUnit(String propertyType, String areaUnit) {
        if (!AreaUnit.offeredFor(PropertyKind.of(propertyType), areaUnit)) {
            return List.of(new Problem("areaUnit", "is not available for this property type"));
        }
        return List.of();
    }

    static List<Problem> landUse(String propertyType, String landUse) {
        PropertyKind kind = PropertyKind.of(propertyType);
        if (landUse != null && kind != null && !kind.isLand()) {
            return List.of(new Problem("landUse", "applies to plots and farm land only"));
        }
        return List.of();
    }

    /** A listing that was never asked a question must not hold an answer to it. */
    static void clearUnaskedAnswers(Property p) {
        if (!PropertyKind.carriesBhk(p.getPropertyType())) {
            p.setBhk(null);
        }
        if (DealIntent.BUY.equals(p.getDeal())) {
            p.setDeposit(null);
            p.setPets(null);
            p.setFormDetails(withoutRentOnly(p.getFormDetails()));
        }
    }

    private static Map<String, Object> withoutRentOnly(Map<String, Object> details) {
        if (details == null || details.keySet().stream().noneMatch(RENT_ONLY_DETAILS::contains)) {
            return details;
        }
        Map<String, Object> kept = new LinkedHashMap<>(details);
        kept.keySet().removeIf(RENT_ONLY_DETAILS::contains);
        return kept;
    }
}
