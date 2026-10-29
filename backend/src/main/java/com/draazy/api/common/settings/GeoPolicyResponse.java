package com.draazy.api.common.settings;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;
import java.util.Map;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeoPolicyResponse(
        Boolean enforceCityLimit,
        Map<String, CityGeo> cities,
        List<BlacklistEntry> blacklist) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record CityGeo(LatLng center, Bounds bounds) {
    }

    public record LatLng(double lat, double lng) {
    }

    public record Bounds(double north, double south, double east, double west) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BlacklistEntry(String id, String placeId, String term) {
    }
}
