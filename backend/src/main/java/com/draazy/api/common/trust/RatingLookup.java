package com.draazy.api.common.trust;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;
import java.util.UUID;

public interface RatingLookup {
    Map<UUID, Rating> forSocieties(Collection<UUID> societyIds);

    record Rating(BigDecimal average, long reviewCount) {
    }
}
