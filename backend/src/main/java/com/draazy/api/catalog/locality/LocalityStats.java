package com.draazy.api.catalog.locality;

import java.math.BigDecimal;

/** What live listings say about a locality; every average is null below {@link #MIN_SAMPLE} samples. */
record LocalityStats(long live, Long avgRent, Long ratePerSqft, Long fromPrice,
        long forSale, long forRent, Long fromSale, Long fromRent) {

    static final int MIN_SAMPLE = 3;

    static final LocalityStats NONE = new LocalityStats(0, null, null, null, 0, 0, null, null);

    boolean indexable() {
        return live >= MIN_SAMPLE;
    }

    /** Row layout is fixed by {@code PropertyRepository#liveLocalityStats}. */
    static LocalityStats of(Object[] r) {
        long live = ((Number) r[1]).longValue();
        return new LocalityStats(live, average(r[2], r[3]), average(r[4], r[5]), asLong(r[6]),
                ((Number) r[7]).longValue(), ((Number) r[8]).longValue(), asLong(r[9]), asLong(r[10]));
    }

    private static Long asLong(Object v) {
        return v == null ? null : ((Number) v).longValue();
    }

    private static Long average(Object sample, Object mean) {
        if (mean == null || ((Number) sample).longValue() < MIN_SAMPLE) {
            return null;
        }
        return new BigDecimal(mean.toString()).setScale(0, java.math.RoundingMode.HALF_UP).longValue();
    }
}
