package com.draazy.api.common.settings;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record GeoPolicyResponse(
        Boolean enforceCityLimit,
        List<BlacklistEntry> blacklist,
        List<String> servedDistricts,
        List<DistrictArea> districtAreas) {
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record DistrictArea(String name, String placeId, Bounds bounds) {
    }

    public record Bounds(double north, double south, double east, double west) {
    }

    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record BlacklistEntry(String id, String placeId, String term) {
    }
}
