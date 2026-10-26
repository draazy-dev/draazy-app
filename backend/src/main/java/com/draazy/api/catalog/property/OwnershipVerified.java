package com.draazy.api.catalog.property;

import java.util.UUID;

/** The listing has just gained the Verified property badge (not a renewal of a standing one). */
public record OwnershipVerified(UUID propertyId) {
}
