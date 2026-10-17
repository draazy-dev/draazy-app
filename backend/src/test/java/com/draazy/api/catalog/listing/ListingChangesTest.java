package com.draazy.api.catalog.listing;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("ListingChanges renders equal values equally so an edit shows only real differences")
class ListingChangesTest {

    @Test
    @DisplayName("BigDecimal scale does not count as a change")
    void scaleIsNotAChange() {
        assertThat(ListingChanges.render(new BigDecimal("2.0"))).isEqualTo(ListingChanges.render(new BigDecimal("2")));
        assertThat(ListingChanges.render(new BigDecimal("0.00"))).isEqualTo(ListingChanges.render(BigDecimal.ZERO));
        assertThat(ListingChanges.render(new BigDecimal("100"))).isEqualTo("100");
    }

    @Test
    @DisplayName("map key order does not count as a change, a changed value does")
    void keyOrderIsNotAChange() {
        Map<String, Object> a = new LinkedHashMap<>();
        a.put("floor", 3);
        a.put("facing", "east");
        Map<String, Object> b = new LinkedHashMap<>();
        b.put("facing", "east");
        b.put("floor", 3);

        assertThat(ListingChanges.render(a)).isEqualTo(ListingChanges.render(b));
        b.put("floor", 4);
        assertThat(ListingChanges.render(a)).isNotEqualTo(ListingChanges.render(b));
        assertThat(ListingChanges.diff(Map.of("f", ListingChanges.render(a)), Map.of("f", ListingChanges.render(a))))
                .isEmpty();
    }
}