package com.draazy.api.catalog.fee;

public final class LeaveAndLicenceCharges {
    private static final long BPS = 10_000L;

    private static final long TENTHS_PER_RUPEE_OF_DUTY = 4_000L;

    private static final long TENTHS_PER_PAISA_OF_DUTY = 40L;

    private static final long REGISTRATION_URBAN = 1_000L;

    private static final long REGISTRATION_RURAL = 500L;

    private static final long MIN_DUTY = 100L;

    public static final long HANDLING_CHARGE = 300L;

    public static final int MAX_MONTHS = 60;

    public static final long MAX_AMOUNT = 1_000_000_000L;

    private LeaveAndLicenceCharges() {
    }

    public record Terms(long monthlyRentInRupees,
            long refundableDepositInRupees,
            long nonRefundableDepositInRupees,
            int months,
            boolean urban,
            int incrementBps,
            int incrementEveryMonths) {
        public Terms {
            require(monthlyRentInRupees > 0 && monthlyRentInRupees <= MAX_AMOUNT, "rent");
            require(refundableDepositInRupees >= 0 && refundableDepositInRupees <= MAX_AMOUNT,
                    "deposit");
            require(nonRefundableDepositInRupees >= 0 && nonRefundableDepositInRupees <= MAX_AMOUNT,
                    "non-refundable deposit");
            require(months > 0 && months <= MAX_MONTHS, "term");
            require(incrementBps >= 0 && incrementBps <= BPS, "increment");
            require(incrementEveryMonths == 11 || incrementEveryMonths == 12, "increment interval");
        }

        public Terms(long monthlyRentInRupees, long refundableDepositInRupees,
                long nonRefundableDepositInRupees, int months, boolean urban) {
            this(monthlyRentInRupees, refundableDepositInRupees, nonRefundableDepositInRupees,
                    months, urban, 0, 11);
        }

        private static void require(boolean ok, String what) {
            if (!ok) {
                throw new IllegalArgumentException(
                        "Leave-and-licence " + what + " is outside the range this can be priced on");
            }
        }
    }

    public record Charges(long exactDutyInPaise, long stampDuty, long registration, long handling) {
        public long total() {
            return stampDuty + registration + handling;
        }
    }

    public static Charges on(Terms terms) {
        long tenths = Math.addExact(
                Math.multiplyExact(Math.addExact(rentForTerm(terms), terms.nonRefundableDepositInRupees()), 10L),
                Math.multiplyExact(terms.refundableDepositInRupees(), years(terms.months())));
        long exactDutyInPaise = (tenths + TENTHS_PER_PAISA_OF_DUTY / 2) / TENTHS_PER_PAISA_OF_DUTY;
        long stampDuty = Math.max(MIN_DUTY,
                (tenths + TENTHS_PER_RUPEE_OF_DUTY / 2) / TENTHS_PER_RUPEE_OF_DUTY);
        return new Charges(exactDutyInPaise, stampDuty,
                terms.urban() ? REGISTRATION_URBAN : REGISTRATION_RURAL, HANDLING_CHARGE);
    }

    private static long rentForTerm(Terms terms) {
        long rent = terms.monthlyRentInRupees();
        long total = 0L;
        for (int paid = 0; paid < terms.months(); paid += terms.incrementEveryMonths()) {
            if (paid > 0) {
                long paise = (Math.multiplyExact(rent, BPS + terms.incrementBps()) + 50L) / 100L;
                rent = paise / 100L;
            }
            int block = Math.min(terms.incrementEveryMonths(), terms.months() - paid);
            total = Math.addExact(total, Math.multiplyExact(rent, (long) block));
        }
        return total;
    }

    private static long years(int months) {
        return (months + 11) / 12;
    }
}
