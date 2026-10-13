package com.draazy.api.billing.credit;

import java.math.BigDecimal;
import java.math.RoundingMode;

/** A GST-inclusive amount split into its taxable value and the tax inside it, in whole rupees. */
record GstSplit(long taxable, long gst, BigDecimal percent) {

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    static GstSplit ofInclusive(long inclusive, BigDecimal percent) {
        long taxable = BigDecimal.valueOf(inclusive).multiply(HUNDRED)
                .divide(HUNDRED.add(percent), 0, RoundingMode.HALF_UP).longValueExact();
        return new GstSplit(taxable, inclusive - taxable, percent);
    }
}