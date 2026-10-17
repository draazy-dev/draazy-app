package com.draazy.api.common.error;

import java.util.UUID;

/** 409 {@code duplicate_submission}: the same listing was just posted; the body carries the existing id. */
public class DuplicateSubmissionException extends ConflictException {

    private final UUID existingId;

    public DuplicateSubmissionException(UUID existingId) {
        super(ErrorCodes.DUPLICATE_SUBMISSION,
                "You just posted this listing. Open it from your dashboard instead of posting it again.");
        this.existingId = existingId;
    }

    public UUID getExistingId() {
        return existingId;
    }
}
