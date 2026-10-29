package com.draazy.api.catalog.society;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import java.util.UUID;import org.springframework.stereotype.Component;

@Component
public class SocietyReference {
    private final SocietyRepository societies;

    public SocietyReference(SocietyRepository societies) {
        this.societies = societies;
    }

    public void require(String societyId) {
        nameOf(societyId);
    }

    public record Binding(UUID id, String name) {
    }

    public Binding rebind(UUID currentId, String currentName, String societyId) {
        if (societyId == null) {
            return new Binding(currentId, currentName);
        }
        if (societyId.isBlank()) {
            return new Binding(null, null);
        }
        UUID parsed = Ids.parseUuid(societyId.trim())
                .orElseThrow(() -> new BadRequestException("societyId is not a valid id"));
        if (parsed.equals(currentId)) {
            return new Binding(currentId, currentName);
        }
        return new Binding(parsed, nameOf(societyId));
    }

    public String nameOf(String societyId) {
        String raw = societyId == null || societyId.isBlank() ? null : societyId.trim();
        if (raw == null) {
            return null;
        }
        UUID parsed = Ids.parseUuid(raw)
                .orElseThrow(() -> new BadRequestException("societyId is not a valid id"));
        return societies.findById(parsed).filter(s -> s.getArchivedAt() == null)
                .orElseThrow(() -> NotFoundException.of("Society"))
                .getName();
    }
}
