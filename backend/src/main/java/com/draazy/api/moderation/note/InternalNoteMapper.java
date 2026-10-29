package com.draazy.api.moderation.note;

import java.util.UUID;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.ReportingPolicy;

@Mapper(componentModel = "spring", unmappedTargetPolicy = ReportingPolicy.ERROR)
public interface InternalNoteMapper {
    @Mapping(target = "authorName", source = "authorName")
    InternalNoteResponse toResponse(InternalNote note, String authorName);

    default String map(UUID value) {
        return value == null ? null : value.toString();
    }
}
