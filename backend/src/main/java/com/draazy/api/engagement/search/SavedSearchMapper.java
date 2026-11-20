package com.draazy.api.engagement.search;

import java.util.Map;
import java.util.UUID;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.mapstruct.ReportingPolicy;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface SavedSearchMapper {
    ObjectMapper FILTERS_JSON = JsonMapper.builder().build();

    @Mapping(target = "filters", source = "filters", qualifiedByName = "jsonStringToObject")
    @Mapping(target = "criteria", source = "criteria", qualifiedByName = "jsonStringToNullableObject")
    @Mapping(target = "matchCount", ignore = true)
    SavedSearchResponse toResponse(SavedSearch entity);

    default String map(UUID value) {
        return value == null ? null : value.toString();
    }

    @Named("jsonStringToObject")
    default Object jsonStringToObject(String json) {
        if (json == null || json.isBlank()) {
            return Map.of();
        }
        try {
            return FILTERS_JSON.readValue(json, Object.class);
        } catch (RuntimeException malformed) {
            return Map.of();
        }
    }

    @Named("jsonStringToNullableObject")
    default Object jsonStringToNullableObject(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return FILTERS_JSON.readValue(json, Object.class);
        } catch (RuntimeException malformed) {
            return null;
        }
    }
}
