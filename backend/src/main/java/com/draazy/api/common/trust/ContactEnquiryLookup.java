package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.UUID;

public interface ContactEnquiryLookup {
    long enquiriesBetween(UUID propertyId, Instant from, Instant to);
}
