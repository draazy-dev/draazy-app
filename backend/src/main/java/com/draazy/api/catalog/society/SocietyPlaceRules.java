package com.draazy.api.catalog.society;

import com.draazy.api.common.error.ValidationException;
import com.draazy.api.provider.PlacesLookup.Place;
import java.util.List;
import java.util.Set;

final class SocietyPlaceRules {
    private static final Set<String> AREA_TYPES = Set.of(
            "locality", "political", "route", "postal_code", "country", "neighborhood", "plus_code", "geocode");

    private static final Set<String> NOT_RESIDENTIAL = Set.of(
            "restaurant", "cafe", "bar", "bakery", "meal_takeaway", "meal_delivery", "food", "night_club",
            "store", "shopping_mall", "supermarket", "convenience_store", "clothing_store",
            "lodging", "hospital", "health", "doctor", "pharmacy", "school", "university",
            "bank", "atm", "finance", "gas_station", "place_of_worship", "hindu_temple", "church", "mosque",
            "gym", "movie_theater", "corporate_office");

    private static final Set<String> BUILDING_TYPES = Set.of("premise", "subpremise");

    private SocietyPlaceRules() {
    }

    static void requireBuilding(Place place) {
        List<String> types = place.types();
        if (types.isEmpty()) {
            return;
        }
        if (types.stream().allMatch(SocietyPlaceRules::isAreaType)) {
            throw new ValidationException("Pick your building, not an area.");
        }
        if (types.stream().anyMatch(NOT_RESIDENTIAL::contains)
                && types.stream().noneMatch(BUILDING_TYPES::contains)) {
            throw new ValidationException("Pick your building, not a shop or office.");
        }
    }

    private static boolean isAreaType(String type) {
        return AREA_TYPES.contains(type) || type.startsWith("sublocality") || type.startsWith("administrative_area_level_");
    }
}
