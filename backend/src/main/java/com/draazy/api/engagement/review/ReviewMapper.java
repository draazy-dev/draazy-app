package com.draazy.api.engagement.review;

import java.util.Collections;
import java.util.Map;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.Named;
import org.mapstruct.ReportingPolicy;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface ReviewMapper {
    ObjectMapper CATEGORIES_JSON = JsonMapper.builder().build();

    TypeReference<Map<String, Integer>> CATEGORY_MAP = new TypeReference<>() {
    };

    @Mapping(target = "id", source = "entity.id")
    @Mapping(target = "author", source = "authorName")
    @Mapping(target = "categories", source = "entity.categories", qualifiedByName = "jsonToCategories")
    @Mapping(target = "mine", source = "mine")
    ReviewResponse toResponse(Review entity, String authorName, Boolean mine);

    @Named("jsonToCategories")
    default Map<String, Integer> jsonToCategories(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyMap();
        }
        try {
            Map<String, Integer> parsed = CATEGORIES_JSON.readValue(json, CATEGORY_MAP);
            return parsed == null ? Collections.emptyMap() : parsed;
        } catch (RuntimeException malformed) {
            return Collections.emptyMap();
        }
    }

    default String map(java.util.UUID value) {
        return value == null ? null : value.toString();
    }
}
