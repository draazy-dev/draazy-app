package com.draazy.api.billing.credit;

import com.draazy.api.common.settings.PlatformSettings;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.UUID;
import org.springframework.stereotype.Component;

/** What invoices and credit notes share: the financial-year number series and the GST split. */
@Component
class TaxDocuments {

    private static final String NEXT_INVOICE = "insert into invoice_sequences (fy, last_value) values (:fy, 1)"
            + " on conflict (fy) do update set last_value = invoice_sequences.last_value + 1 returning last_value";

    private static final String NEXT_CREDIT_NOTE = "insert into credit_note_sequences (fy, last_value) values (:fy, 1)"
            + " on conflict (fy) do update set last_value = credit_note_sequences.last_value + 1 returning last_value";

    private static final ZoneId INDIA = ZoneId.of("Asia/Kolkata");

    // The platform's configured rate is 0 while prices are quoted GST-inclusive; the tax inside them is 18%.
    private static final BigDecimal STATUTORY_PERCENT = new BigDecimal("18");

    private final EntityManager entityManager;
    private final PlatformSettings settings;

    TaxDocuments(EntityManager entityManager, PlatformSettings settings) {
        this.entityManager = entityManager;
        this.settings = settings;
    }

    /** April to March in India, as the two-digit years it spans: 2627 for 1 April 2026 to 31 March 2027. */
    static String financialYear(Instant instant) {
        ZonedDateTime local = instant.atZone(INDIA);
        int start = local.getMonthValue() >= 4 ? local.getYear() : local.getYear() - 1;
        return String.format("%02d%02d", start % 100, (start + 1) % 100);
    }

    /** The next number in the series, e.g. {@code INV-FY2627-000001}; rolls back with the caller. */
    String nextInvoiceNumber(Instant at) {
        return number("INV", entityManager.createNativeQuery(NEXT_INVOICE), at);
    }

    String nextCreditNoteNumber(Instant at) {
        return number("CN", entityManager.createNativeQuery(NEXT_CREDIT_NOTE), at);
    }

    private static String number(String prefix, Query nextInSequence, Instant at) {
        String fy = financialYear(at);
        Object next = nextInSequence.setParameter("fy", fy).getSingleResult();
        return prefix + "-FY" + fy + "-" + String.format("%06d", ((Number) next).longValue());
    }

    /** Serialises issuing for one source, so a replayed or concurrent callback cannot number it twice. */
    void lockSource(String sourceType, UUID sourceId) {
        entityManager.createNativeQuery("select count(*) from (select pg_advisory_xact_lock(hashtextextended(:key, 0))) l")
                .setParameter("key", "tax-doc:" + sourceType + ":" + sourceId)
                .getSingleResult();
    }

    GstSplit split(long amount, long taxableInclusive) {
        BigDecimal percent = settings.gstPercent().signum() > 0 ? settings.gstPercent() : STATUTORY_PERCENT;
        return GstSplit.ofInclusive(Math.min(amount, Math.max(0, taxableInclusive)), percent);
    }
}
