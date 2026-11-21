package com.draazy.api.catalog.listing;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Method;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class ListingEditRulesCarpetAreaTest {

    private static boolean material(BigDecimal current, BigDecimal incoming) throws Exception {
        Method m = ListingEditRules.class.getDeclaredMethod(
                "materialCarpetAreaChange", BigDecimal.class, BigDecimal.class);
        m.setAccessible(true);
        return (boolean) m.invoke(null, current, incoming);
    }

    private static boolean numericEquals(BigDecimal a, BigDecimal b) throws Exception {
        Method m = ListingEditRules.class.getDeclaredMethod("numericEquals", BigDecimal.class, BigDecimal.class);
        m.setAccessible(true);
        return (boolean) m.invoke(null, a, b);
    }

    @Test
    void nullIncomingIsNeverAMaterialChange() throws Exception {
        assertThat(material(new BigDecimal("900"), null)).isFalse();
        assertThat(material(null, null)).isFalse();
    }

    @Test
    void absentOrZeroCurrentIsNeverAMaterialChange() throws Exception {
        assertThat(material(null, new BigDecimal("900"))).isFalse();
        assertThat(material(BigDecimal.ZERO, new BigDecimal("900"))).isFalse();
    }

    @Test
    void twentyPercentOrMoreIsMaterial() throws Exception {
        assertThat(material(new BigDecimal("1000"), new BigDecimal("1200"))).isTrue();
        assertThat(material(new BigDecimal("1000"), new BigDecimal("800"))).isTrue();
        assertThat(material(new BigDecimal("1000"), new BigDecimal("1199"))).isFalse();
        assertThat(material(new BigDecimal("1000"), new BigDecimal("1000.00"))).isFalse();
    }

    @Test
    void numericEqualsIgnoresScaleAndTreatsNullsAsEqualOnlyTogether() throws Exception {
        assertThat(numericEquals(new BigDecimal("2"), new BigDecimal("2.0"))).isTrue();
        assertThat(numericEquals(new BigDecimal("2"), new BigDecimal("3"))).isFalse();
        assertThat(numericEquals(null, null)).isTrue();
        assertThat(numericEquals(null, BigDecimal.ONE)).isFalse();
        assertThat(numericEquals(BigDecimal.ONE, null)).isFalse();
    }
}
