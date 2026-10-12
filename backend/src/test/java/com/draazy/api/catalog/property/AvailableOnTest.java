package com.draazy.api.catalog.property;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.draazy.api.common.error.ValidationException;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class AvailableOnTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 6, 10);

    @Test
    void bucketBoundaries() {
        assertThat(AvailableOn.bucketOf(null, TODAY)).isNull();
        assertThat(AvailableOn.bucketOf(TODAY.minusDays(3), TODAY)).isEqualTo("now");
        assertThat(AvailableOn.bucketOf(TODAY, TODAY)).isEqualTo("now");
        assertThat(AvailableOn.bucketOf(TODAY.plusDays(1), TODAY)).isEqualTo("15");
        assertThat(AvailableOn.bucketOf(TODAY.plusDays(15), TODAY)).isEqualTo("15");
        assertThat(AvailableOn.bucketOf(TODAY.plusDays(16), TODAY)).isEqualTo("30");
        assertThat(AvailableOn.bucketOf(TODAY.plusDays(30), TODAY)).isEqualTo("30");
        assertThat(AvailableOn.bucketOf(TODAY.plusDays(31), TODAY)).isNull();
    }

    @Test
    void legacyBucketsBecomeDates() {
        assertThat(AvailableOn.fromBucket("now", TODAY)).isEqualTo(TODAY);
        assertThat(AvailableOn.fromBucket("15", TODAY)).isEqualTo(TODAY.plusDays(15));
        assertThat(AvailableOn.fromBucket("30", TODAY)).isEqualTo(TODAY.plusDays(30));
        assertThat(AvailableOn.fromBucket("", TODAY)).isNull();
        assertThat(AvailableOn.fromBucket(null, TODAY)).isNull();
    }

    @Test
    void parseEnforcesTheWindowOnlyWhenAsked() {
        assertThat(AvailableOn.parse("2026-06-10", TODAY, false, "rent")).isEqualTo(TODAY);
        assertThat(AvailableOn.parse("2027-06-10", TODAY, false, "rent")).isEqualTo(TODAY.plusDays(365));
        assertThatThrownBy(() -> AvailableOn.parse("2026-06-09", TODAY, false, "rent"))
                .isInstanceOf(ValidationException.class);
        assertThat(AvailableOn.parse("2026-06-09", TODAY, true, "rent")).isEqualTo(TODAY.minusDays(1));
        assertThatThrownBy(() -> AvailableOn.parse("2027-06-11", TODAY, true, "rent"))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> AvailableOn.parse("soon", TODAY, true, "rent"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void aSaleMayRunFiveYearsOut() {
        assertThat(AvailableOn.parse("2030-06-10", TODAY, false, "buy")).isEqualTo(TODAY.plusYears(4));
        assertThat(AvailableOn.parse("2031-06-10", TODAY, false, "buy")).isEqualTo(TODAY.plusYears(5));
        assertThatThrownBy(() -> AvailableOn.parse("2031-06-11", TODAY, false, "buy"))
                .isInstanceOf(ValidationException.class);
        assertThatThrownBy(() -> AvailableOn.parse("2027-06-11", TODAY, false, "rent"))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void statedNeedsEitherField() {
        assertThat(AvailableOn.isStated(null, null)).isFalse();
        assertThat(AvailableOn.isStated("", null)).isTrue();
        assertThat(AvailableOn.isStated(null, "now")).isTrue();
    }
}
