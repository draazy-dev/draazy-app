package com.draazy.api.common.trust;

import java.time.Instant;
import java.util.UUID;

/** Contact requests a listing has received, for the listing-pass guarantee; answered by the leads context. */
public interface ContactEnquiryLookup {

    /** Requests first made on the listing in {@code [from, to)}, whatever became of them. */
    long enquiriesBetween(UUID propertyId, Instant from, Instant to);
}
