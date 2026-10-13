package com.draazy.api.billing.credit;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Issues the GST credit note for a refund the gateway confirmed. One per refund, numbered per financial year. */
@Service
public class CreditNotes {

    public static final String SUBSCRIPTION = "subscription";

    public static final String SERVICE_REQUEST_REFUND = "service_request_refund";

    private final CreditNoteRepository notes;
    private final InvoiceRepository invoices;
    private final TaxDocuments documents;

    public CreditNotes(CreditNoteRepository notes, InvoiceRepository invoices, TaxDocuments documents) {
        this.notes = notes;
        this.invoices = invoices;
        this.documents = documents;
    }

    /** A credit note must cite an invoice, so an order that was never invoiced gets none. */
    @Transactional
    public Optional<CreditNote> issue(UUID userId, String sourceType, UUID sourceId, String orderRef, long amount,
            Instant now) {
        if (amount <= 0) {
            return Optional.empty();
        }
        Optional<CreditNote> existing = notes.findBySourceTypeAndSourceId(sourceType, sourceId);
        if (existing.isPresent()) {
            return existing;
        }
        Optional<Invoice> invoice = orderRef == null ? Optional.empty() : invoices.findByOrderRef(orderRef);
        if (invoice.isEmpty()) {
            return Optional.empty();
        }
        Invoice original = invoice.get();
        long taxableInclusive = original.taxableInclusive() - notes.creditedTaxableInclusive(original.getNumber());
        GstSplit split = documents.split(amount, taxableInclusive);
        String number = documents.nextCreditNoteNumber(now);
        return Optional.of(notes.save(new CreditNote(number, userId, sourceType, sourceId, orderRef, amount, split,
                original.getNumber(), now)));
    }
}
