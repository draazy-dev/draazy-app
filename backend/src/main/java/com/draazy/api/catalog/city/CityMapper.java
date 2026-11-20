package com.draazy.api.catalog.city;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface CityMapper {
    @Mapping(target = "listingCount", source = "listingCount")
    CityResponse toResponse(City city, long listingCount);
}
