package com.draazy.api.billing.credit;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Issues the invoice when a payment succeeds. One per source, numbered per financial year. */
@Service
public class Invoices {

    public static final String SUBSCRIPTION = "subscription";

    public static final String SERVICE_REQUEST = "service_request";

    public static final String SERVICE_REQUEST_AMENDMENT = "service_request_amendment";

    private final InvoiceRepository invoices;
    private final TaxDocuments documents;

    public Invoices(InvoiceRepository invoices, TaxDocuments documents) {
        this.invoices = invoices;
        this.documents = documents;
    }

    /** {@code taxable} is the part of {@code amount} that is Draazy's own fee; the rest is pass-through.
     * Returns the existing invoice when this source already has one, so a replayed callback issues nothing new. */
    @Transactional
    public Optional<Invoice> issue(UUID userId, String sourceType, UUID sourceId, String orderRef, long amount,
            long taxable, Instant now) {
        if (amount <= 0 || userId == null) {
            return Optional.empty();
        }
        documents.lockSource(sourceType, sourceId);
        Optional<Invoice> existing = invoices.findBySourceTypeAndSourceId(sourceType, sourceId);
        if (existing.isPresent()) {
            return existing;
        }
        String number = documents.nextInvoiceNumber(now);
        return Optional.of(invoices.save(new Invoice(number, userId, sourceType, sourceId, orderRef, amount,
                documents.taxablePart(amount, taxable), now)));
    }

    public boolean issued(String sourceType, UUID sourceId) {
        return invoices.findBySourceTypeAndSourceId(sourceType, sourceId).isPresent();
    }
}
