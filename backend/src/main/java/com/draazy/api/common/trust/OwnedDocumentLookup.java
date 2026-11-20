package com.draazy.api.common.trust;

import java.util.Optional;
import java.util.UUID;

public interface OwnedDocumentLookup {
    String RENT_AGREEMENT = "rent_agreement";
    String ELECTRICITY_BILL = "electricity_bill";

    boolean ownsDocument(UUID userId, UUID documentId);

    Optional<String> flatEvidenceType(UUID userId, UUID documentId);
}
