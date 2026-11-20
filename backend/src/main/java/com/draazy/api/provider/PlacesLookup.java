package com.draazy.api.provider;

import com.draazy.api.security.LocalOnly;
import com.draazy.api.security.LocalProfileGuard;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

public interface PlacesLookup {
    Optional<Place> details(String placeId, Place hint);

    record Place(String placeId, String name, Double lat, Double lng, String pincode, List<String> types,
            String district) {
        public Place {
            types = types == null ? List.of() : List.copyOf(types);
        }
    }

    class UnavailableException extends RuntimeException {
        public UnavailableException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}

@Component
@LocalOnly
@ConditionalOnExpression("'${draazy.google.places.server-key:}'.isBlank()")
class DevPlacesLookup implements PlacesLookup {
    @Override
    public Optional<Place> details(String placeId, Place hint) {
        if (hint == null || hint.name() == null || hint.name().isBlank()) {
            return Optional.empty();
        }
        return Optional.of(new Place(placeId, hint.name().trim(), hint.lat(), hint.lng(), hint.pincode(), hint.types(),
                district(hint.lat(), hint.lng())));
    }

    // Without Google there is no district, so a box around Pune district stands in for it.
    static String district(Double lat, Double lng) {
        boolean inPune = lat != null && lng != null && lat >= 17.85 && lat <= 19.40 && lng >= 73.30 && lng <= 75.20;
        return inPune ? "Pune" : null;
    }
}

@Component
@Profile(LocalProfileGuard.NOT_LOCAL)
@ConditionalOnExpression("'${draazy.google.places.server-key:}'.isBlank()")
class UnconfiguredPlacesLookup implements PlacesLookup {
    private static final Logger log = LoggerFactory.getLogger(UnconfiguredPlacesLookup.class);

    private final AtomicBoolean reported = new AtomicBoolean();

    @Override
    public Optional<Place> details(String placeId, Place hint) {
        if (reported.compareAndSet(false, true)) {
            log.error("No Places verifier is configured, so societies cannot be added. "
                    + "Set GOOGLE_PLACES_SERVER_KEY (draazy.google.places.server-key).");
        }
        throw new UnavailableException("No Places verifier is configured", null);
    }
}
