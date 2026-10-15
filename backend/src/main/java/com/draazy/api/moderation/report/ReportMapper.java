package com.draazy.api.moderation.report;

import java.util.UUID;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

/** Plain generated mapping: {@code reporterId} is absent from {@link ReportResponse}, so it cannot
 * cross the wire by accident. */
@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface ReportMapper {

    @Mapping(target = "targetReportCount", ignore = true)
    @Mapping(target = "targetTitle", ignore = true)
    @Mapping(target = "targetName", ignore = true)
    @Mapping(target = "targetMobile", ignore = true)
    ReportResponse toResponse(Report entity);

    default String map(UUID value) {
        return value == null ? null : value.toString();
    }
}
