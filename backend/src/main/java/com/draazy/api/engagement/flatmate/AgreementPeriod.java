package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.ValidationException;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.Map;

/** The host's own reading of the agreement's term. A claim for the reviewer to confirm against the
 * document, never the badge expiry: that comes from the reviewer's checks. */
record AgreementPeriod(LocalDate from, LocalDate till) {

    static final String FROM = "validFrom";
    static final String TILL = "validTill";

    static AgreementPeriod of(Map<String, Object> doc, LocalDate today) {
        LocalDate from = date(doc, FROM);
        LocalDate till = date(doc, TILL);
        if (!till.isAfter(from)) {
            throw new ValidationException("agreementDoc.validTill must be after agreementDoc.validFrom.");
        }
        if (!till.isAfter(today)) {
            throw new ValidationException("This agreement has ended; upload the current one.");
        }
        return new AgreementPeriod(from, till);
    }

    private static LocalDate date(Map<String, Object> doc, String key) {
        Object raw = doc.get(key);
        if (raw == null || raw.toString().isBlank()) {
            throw new ValidationException("agreementDoc." + key + " is required for a rent agreement.");
        }
        try {
            return LocalDate.parse(raw.toString().strip());
        } catch (DateTimeParseException e) {
            throw new ValidationException("agreementDoc." + key + " must be a date (yyyy-mm-dd).");
        }
    }
}
