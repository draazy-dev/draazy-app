package com.draazy.api.catalog.property;

import java.util.UUID;

/** A deal was finalized: the listing is now sold or rented. */
public record PropertyClosed(UUID propertyId) {
}
