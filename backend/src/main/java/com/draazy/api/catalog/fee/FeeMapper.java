package com.draazy.api.catalog.fee;

import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface FeeMapper {
    FeeResponse toResponse(PlatformFee fee);
}
