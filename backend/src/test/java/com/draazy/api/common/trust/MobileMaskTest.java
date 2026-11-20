package com.draazy.api.common.trust;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class MobileMaskTest {
    @Test
    void masksToTheContractForm() {
        assertThat(MobileMask.mask("9821000123")).isEqualTo("98XXXXX123");
    }

    @Test
    void stripsPunctuationBeforeMasking() {
        assertThat(MobileMask.mask("98210 00123")).isEqualTo("98XXXXX123");
    }

    @Test
    void refusesToHalfMaskSomethingThatIsNotAMobile() {
        assertThat(MobileMask.mask("98210")).isNull();
        assertThat(MobileMask.mask("")).isNull();
        assertThat(MobileMask.mask(null)).isNull();
    }

    @Test
    void normalisesAPlainMobile() {
        assertThat(MobileMask.normalise("9821000123")).isEqualTo("9821000123");
    }

    @Test
    void normalisesThroughPunctuationAndCountryCode() {
        assertThat(MobileMask.normalise("+91 98210 00123")).isEqualTo("9821000123");
        assertThat(MobileMask.normalise("0091-9821000123")).isEqualTo("9821000123");
        assertThat(MobileMask.normalise("09821000123")).isEqualTo("9821000123");
    }

    @Test
    void rejectsAMaskedNumberRatherThanTreatingItAsAnIdentity() {
        assertThat(MobileMask.normalise("98XXXXX123")).isNull();
        assertThat(MobileMask.normalise("98\u2022\u2022\u2022\u2022\u2022123")).isNull();
    }

    @Test
    void rejectsAnythingThatIsNotAWholeMobile() {
        assertThat(MobileMask.normalise("98210")).isNull();
        assertThat(MobileMask.normalise("")).isNull();
        assertThat(MobileMask.normalise(null)).isNull();
        assertThat(MobileMask.normalise("129821000123")).isNull();
    }

    @Test
    void maskIsStrictAboutCountryCodesBecauseNormaliseAlreadyRanFirst() {
        assertThat(MobileMask.mask("+91 98210 00123")).isNull();
        assertThat(MobileMask.mask(MobileMask.normalise("+91 98210 00123")))
                .isEqualTo("98XXXXX123");
    }
}
