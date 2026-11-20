package com.draazy.api.common.trust;

import java.util.Optional;
import java.util.UUID;

public interface PersonalDocumentLookup {
    boolean isOwnedBy(UUID documentId, UUID ownerId);

    // Owner id is required with the document id: an id-only read exposes any user's Aadhaar/PAN.
    // Mismatch and missing row both return empty, so it is no existence oracle.
    Optional<PersonalDocumentView> viewOwnedBy(UUID documentId, UUID ownerId);
}
