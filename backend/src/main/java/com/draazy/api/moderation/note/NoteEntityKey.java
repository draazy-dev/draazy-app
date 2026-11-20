package com.draazy.api.moderation.note;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Ids;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class NoteEntityKey {
    private final PropertyRepository properties;

    public NoteEntityKey(PropertyRepository properties) {
        this.properties = properties;
    }

    public String resolve(String entityType, String entityId) {
        if (!NoteEntityTypes.PROPERTY.equals(entityType) || entityId == null) {
            return entityId;
        }
        if (Ids.parseUuid(entityId).isPresent()) {
            return entityId;
        }
        return properties.findBySlug(entityId)
                .map(property -> property.getId())
                .map(UUID::toString)
                .orElse(entityId);
    }
}
