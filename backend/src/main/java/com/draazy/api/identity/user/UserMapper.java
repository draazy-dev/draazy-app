package com.draazy.api.identity.user;

import java.util.UUID;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface UserMapper {
    @Mapping(target = "permissions", ignore = true)
    @Mapping(target = "desks", ignore = true)
    @Mapping(target = "flagged", ignore = true)
    @Mapping(target = "flagReason", ignore = true)
    @Mapping(target = "badgeSource", ignore = true)
    UserResponse toResponse(User user);

    default String map(UUID value) {
        return value == null ? null : value.toString();
    }
}
