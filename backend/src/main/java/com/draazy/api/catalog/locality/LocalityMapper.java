package com.draazy.api.catalog.locality;

import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface LocalityMapper {

    @Mapping(target = "liveListings", source = "stats.live")
    @Mapping(target = "indexable", expression = "java(stats.indexable())")
    @Mapping(target = "avgRent", source = "stats.avgRent")
    @Mapping(target = "ratePerSqft", source = "stats.ratePerSqft")
    @Mapping(target = "fromPrice", source = "stats.fromPrice")
    @Mapping(target = "forSale", source = "stats.forSale")
    @Mapping(target = "forRent", source = "stats.forRent")
    @Mapping(target = "fromSale", source = "stats.fromSale")
    @Mapping(target = "fromRent", source = "stats.fromRent")
    LocalityResponse toResponse(Locality locality, LocalityStats stats);
}
