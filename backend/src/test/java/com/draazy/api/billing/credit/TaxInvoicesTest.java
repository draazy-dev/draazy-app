package com.draazy.api.billing.credit;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Invoices: one per payment, numbered per financial year; credit notes never credit more fee than was invoiced")
class TaxInvoicesTest extends AbstractApiTest {

    private static final Instant FY4041_START = Instant.parse("2040-04-01T00:00:00Z");

    @Autowired Invoices invoices;
    @Autowired CreditNotes creditNotes;
    @Autowired UserRepository users;
    @Autowired EntityManager em;

    private int seq;

    private User customer() {
        User u = new User("9831" + String.format("%06d", ++seq), "buyer");
        u.setName("Invoice buyer");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Map<String, Object> invoice(UUID sourceId) {
        em.flush();
        return jdbc.queryForMap("select number, amount, taxable_amount, order_ref from invoices where source_id = ?",
                sourceId);
    }

    private long n(Map<String, Object> row, String key) {
        return ((Number) row.get(key)).longValue();
    }

    @Test
    void numbersRunOnWithinAFinancialYearAndRestartInTheNext() {
        User u = customer();
        Invoice first = invoices.issue(u.getId(), Invoices.SUBSCRIPTION, UUID.randomUUID(), "o1", 199, 199, FY4041_START)
                .orElseThrow();
        Invoice second = invoices.issue(u.getId(), Invoices.SUBSCRIPTION, UUID.randomUUID(), "o2", 999, 999,
                Instant.parse("2041-03-31T18:29:59Z")).orElseThrow();
        Invoice nextYear = invoices.issue(u.getId(), Invoices.SUBSCRIPTION, UUID.randomUUID(), "o3", 199, 199,
                Instant.parse("2041-03-31T18:30:00Z")).orElseThrow();

        assertThat(first.getNumber()).isEqualTo("INV-FY4041-000001");
        assertThat(second.getNumber()).isEqualTo("INV-FY4041-000002");
        assertThat(nextYear.getNumber()).isEqualTo("INV-FY4142-000001");
    }

    @Test
    void aReplayedPaymentIssuesNothingNew() {
        User u = customer();
        UUID source = UUID.randomUUID();

        Invoice once = invoices.issue(u.getId(), Invoices.SUBSCRIPTION, source, "o1", 199, 199, FY4041_START).orElseThrow();
        Invoice again = invoices.issue(u.getId(), Invoices.SUBSCRIPTION, source, "o1", 199, 199, FY4041_START.plusSeconds(5))
                .orElseThrow();

        assertThat(again.getNumber()).isEqualTo(once.getNumber());
        assertThat(jdbc.queryForObject("select count(*) from invoices where source_id = ?", Long.class, source)).isEqualTo(1);
    }

    @Test
    void aFreeOrderGetsNoInvoice() {
        assertThat(invoices.issue(customer().getId(), Invoices.SUBSCRIPTION, UUID.randomUUID(), "o0", 0, 0, FY4041_START))
                .isEmpty();
    }

    @Test
    void onlyThePlatformFeeIsCountedAsTaxable() {
        User u = customer();
        UUID source = UUID.randomUUID();
        invoices.issue(u.getId(), Invoices.SERVICE_REQUEST, source, "ra1", 5000, 499, FY4041_START);

        Map<String, Object> row = invoice(source);

        assertThat(n(row, "amount")).isEqualTo(5000);
        assertThat(n(row, "taxable_amount")).isEqualTo(499);
    }

    @Test
    void anAmendmentTopUpCarriesNoPlatformFee() {
        User u = customer();
        UUID source = UUID.randomUUID();
        invoices.issue(u.getId(), Invoices.SERVICE_REQUEST_AMENDMENT, source, "am1", 800, 0, FY4041_START);

        Map<String, Object> row = invoice(source);

        assertThat(n(row, "taxable_amount")).isZero();
    }

    @Test
    void aCreditNoteNamesTheInvoiceAndNeverCreditsMoreTaxableThanItCarried() {
        User u = customer();
        invoices.issue(u.getId(), Invoices.SERVICE_REQUEST, UUID.randomUUID(), "ra2", 5000, 499, FY4041_START);

        CreditNote first = creditNotes.issue(u.getId(), CreditNotes.SERVICE_REQUEST_REFUND, UUID.randomUUID(), "ra2", 300,
                FY4041_START).orElseThrow();
        CreditNote second = creditNotes.issue(u.getId(), CreditNotes.SERVICE_REQUEST_REFUND, UUID.randomUUID(), "ra2", 300,
                FY4041_START).orElseThrow();
        CreditNote third = creditNotes.issue(u.getId(), CreditNotes.SERVICE_REQUEST_REFUND, UUID.randomUUID(), "ra2", 4000,
                FY4041_START).orElseThrow();

        assertThat(jdbc.queryForObject("select invoice_no from credit_notes where id = ?", String.class, first.getId()))
                .isEqualTo("INV-FY4041-000001");
        assertThat(taxed(first)).isEqualTo(300);
        assertThat(taxed(second)).isEqualTo(199);
        assertThat(taxed(third)).isZero();
    }

    @Test
    void anOrderThatCarriedNoPlatformFeeCreditsNoFee() {
        User u = customer();
        invoices.issue(u.getId(), Invoices.SERVICE_REQUEST, UUID.randomUUID(), "ra3", 2000, 0, FY4041_START);

        CreditNote note = creditNotes.issue(u.getId(), CreditNotes.SERVICE_REQUEST_REFUND, UUID.randomUUID(), "ra3", 2000,
                FY4041_START).orElseThrow();

        assertThat(taxed(note)).isZero();
    }

    @Test
    void anOrderThatWasNeverInvoicedGetsNoCreditNote() {
        User u = customer();

        assertThat(creditNotes.issue(u.getId(), CreditNotes.SERVICE_REQUEST_REFUND, UUID.randomUUID(), "none", 500,
                FY4041_START)).isEmpty();
        assertThat(creditNotes.issue(u.getId(), CreditNotes.SUBSCRIPTION, UUID.randomUUID(), "none2", 199,
                FY4041_START)).isEmpty();
    }

    private long taxed(CreditNote note) {
        em.flush();
        return jdbc.queryForObject("select taxable_amount from credit_notes where id = ?", Long.class, note.getId());
    }
}
