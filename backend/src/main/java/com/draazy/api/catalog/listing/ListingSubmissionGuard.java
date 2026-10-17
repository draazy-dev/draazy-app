package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.DuplicateSubmissionException;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** Refuses a create that replays a posting the owner made moments ago (double-tap, retried request). */
@Component
class ListingSubmissionGuard {

    private static final Duration WINDOW = Duration.ofMinutes(10);

    private final PropertyRepository properties;

    ListingSubmissionGuard(PropertyRepository properties) {
        this.properties = properties;
    }

    void requireNotReplay(UUID ownerId, ListingCreate in) {
        String title = normalize(in.title());
        String address = normalize(in.address());
        String type = normalize(in.propertyType());
        properties.recentlyPostedBy(ownerId, Instant.now().minus(WINDOW)).stream()
                .filter(p -> normalize(p.getTitle()).equals(title)
                        && normalize(p.getAddress()).equals(address)
                        && normalize(p.getPropertyType()).equals(type)
                        && Objects.equals(p.getDeal(), in.deal())
                        && Objects.equals(p.getPrice(), in.price()))
                .findFirst()
                .ifPresent(existing -> {
                    throw new DuplicateSubmissionException(existing.getId());
                });
    }

    private static String normalize(String text) {
        return text == null ? "" : text.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
    }
}
