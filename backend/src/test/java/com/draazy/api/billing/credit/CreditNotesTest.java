package com.draazy.api.billing.credit;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Credit notes: financial year (Apr-Mar, IST) and the GST split")
class CreditNotesTest {

    @Test
    void theFinancialYearTurnsOverAtMidnightIst() {
        assertThat(TaxDocuments.financialYear(Instant.parse("2026-03-31T18:29:59Z"))).isEqualTo("2526");
        assertThat(TaxDocuments.financialYear(Instant.parse("2026-03-31T18:30:00Z"))).isEqualTo("2627");
        assertThat(TaxDocuments.financialYear(Instant.parse("2027-02-10T05:00:00Z"))).isEqualTo("2627");
        assertThat(TaxDocuments.financialYear(Instant.parse("2027-03-31T18:30:00Z"))).isEqualTo("2728");
    }

    @Test
    void anInclusiveAmountSplitsIntoTaxableAndGstWithNothingLost() {
        GstSplit pack = GstSplit.ofInclusive(199, new BigDecimal("18"));
        assertThat(pack.taxable()).isEqualTo(169);
        assertThat(pack.gst()).isEqualTo(30);
        GstSplit pass = GstSplit.ofInclusive(999, new BigDecimal("18"));
        assertThat(pass.taxable() + pass.gst()).isEqualTo(999);
        assertThat(pass.taxable()).isEqualTo(847);
    }
}