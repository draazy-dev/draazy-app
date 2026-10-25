package com.draazy.api.common.trust;

import java.util.Optional;
import java.util.UUID;

public interface OwnedDocumentLookup {

    String RENT_AGREEMENT = "rent_agreement";
    String ELECTRICITY_BILL = "electricity_bill";

    boolean ownsDocument(UUID userId, UUID documentId);

    /** The kind of flat evidence a personal-vault document is: filed as "Rent agreement" or "Electricity Bill",
     * so an unrelated file cannot back a badge. Empty when it is not the user's own or of another category. */
    Optional<String> flatEvidenceType(UUID userId, UUID documentId);
}
