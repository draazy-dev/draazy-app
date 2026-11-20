package com.draazy.api.engagement.review;

import com.draazy.api.catalog.locality.LocalityRepository;
import com.draazy.api.catalog.society.SocietyRepository;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.UserRepository;
import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class ReviewTargetKey {
    private final SocietyRepository societies;
    private final LocalityRepository localities;
    private final UserRepository users;

    public ReviewTargetKey(SocietyRepository societies, LocalityRepository localities,
            UserRepository users) {
        this.societies = societies;
        this.localities = localities;
        this.users = users;
    }

    public String resolve(String entityType, String entityId) {
        if (!ReviewTargetTypes.isEntityTarget(entityType)) {
            throw new NotFoundException("Unknown review target type '" + entityType + "'");
        }
        return switch (entityType) {
            case ReviewTargetTypes.SOCIETY -> societies.findBySlugAndArchivedAtIsNull(entityId)
                    .map(s -> s.getId().toString())
                    .orElseGet(() -> societyById(entityId));
            case ReviewTargetTypes.LOCALITY -> localities.findById(entityId)
                    .map(l -> l.getSlug())
                    .orElseThrow(() -> NotFoundException.of("Locality"));
            case ReviewTargetTypes.OWNER -> users.findById(uuid(entityId, "Owner"))
                    .map(u -> u.getId().toString())
                    .orElseThrow(() -> NotFoundException.of("Owner"));
            default -> throw new NotFoundException("Unknown review target type '" + entityType + "'");
        };
    }

    private String societyById(String raw) {
        return societies.findById(uuid(raw, "Society"))
                .filter(s -> s.getArchivedAt() == null)
                .map(s -> s.getId().toString())
                .orElseThrow(() -> NotFoundException.of("Society"));
    }

    // Malformed UUID is a 404, not 400, so the response cannot distinguish bad shape from no such row.
    private static UUID uuid(String raw, String kind) {
        return Ids.parseUuid(raw)
                .orElseThrow(() -> NotFoundException.of(kind));
    }
}
