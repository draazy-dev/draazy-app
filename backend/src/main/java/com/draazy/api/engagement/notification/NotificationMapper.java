package com.draazy.api.engagement.notification;

import java.util.UUID;
import org.mapstruct.Mapper;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface NotificationMapper {
    NotificationResponse toResponse(Notification entity);

    default String map(UUID value) {
        return value == null ? null : value.toString();
    }
}
