package com.draazy.api.billing.refund;

import java.time.Duration;
import java.time.Instant;
import java.util.function.BooleanSupplier;
import java.util.function.IntSupplier;
import java.util.function.LongSupplier;

/** The refund rules as a pure function of the order, the clock and the settings. */
final class RefundPolicy {

    /** How long after the guarantee window closes the owner may still claim it. */
    static final Duration CLAIM_PERIOD = Duration.ofDays(7);

    private RefundPolicy() {
    }

    record Rules(int packRefundDays, int passGuaranteeDays, int passGuaranteeMaxEnquiries) {
    }

    record Pack(boolean alreadyRequested, boolean entitling, Instant paidAt, IntSupplier contactsUsed) {
    }

    record Pass(boolean alreadyRequested, boolean entitling, boolean disputed, Instant startedAt,
            BooleanSupplier listingLive, BooleanSupplier pausedInWindow, LongSupplier enquiries,
            LongSupplier linkedGuarantees) {
    }

    static RefundVerdict pack(Pack pack, Rules rules, Instant now) {
        if (pack.alreadyRequested()) {
            return RefundVerdict.no(RefundReasons.ALREADY_REQUESTED, null, null);
        }
        Instant until = pack.paidAt().plus(Duration.ofDays(rules.packRefundDays()));
        if (rules.packRefundDays() == 0 || !pack.entitling() || now.isAfter(until)) {
            return RefundVerdict.no(RefundReasons.WINDOW_CLOSED, pack.paidAt(), until);
        }
        if (pack.contactsUsed().getAsInt() > 0) {
            return RefundVerdict.no(RefundReasons.NOT_ELIGIBLE_USED, pack.paidAt(), until);
        }
        return RefundVerdict.yes(RefundReasons.PACK_UNUSED, RefundStatuses.BASIS_PACK_UNUSED, pack.paidAt(), until);
    }

    static RefundVerdict pass(Pass pass, Rules rules, Instant now) {
        if (pass.alreadyRequested()) {
            return RefundVerdict.no(RefundReasons.ALREADY_REQUESTED, null, null);
        }
        if (rules.passGuaranteeDays() == 0) {
            return RefundVerdict.no(RefundReasons.WINDOW_CLOSED, null, null);
        }
        Instant from = pass.startedAt().plus(Duration.ofDays(rules.passGuaranteeDays()));
        Instant until = from.plus(CLAIM_PERIOD);
        if (pass.disputed()) {
            return RefundVerdict.no(RefundReasons.NOT_ELIGIBLE_USED, from, until);
        }
        if (!pass.entitling() || now.isAfter(until)) {
            return RefundVerdict.no(RefundReasons.WINDOW_CLOSED, from, until);
        }
        if (now.isBefore(from)) {
            return RefundVerdict.no(RefundReasons.WINDOW_NOT_OPEN, from, until);
        }
        if (pass.pausedInWindow().getAsBoolean()) {
            return RefundVerdict.no(RefundReasons.LISTING_PAUSED, from, until);
        }
        if (!pass.listingLive().getAsBoolean() || pass.enquiries().getAsLong() > rules.passGuaranteeMaxEnquiries()) {
            return RefundVerdict.no(RefundReasons.NOT_ELIGIBLE_USED, from, until);
        }
        if (pass.linkedGuarantees().getAsLong() > 0) {
            return RefundVerdict.no(RefundReasons.GUARANTEE_USED_RECENTLY, from, until);
        }
        return RefundVerdict.yes(RefundReasons.PASS_NO_ENQUIRIES, RefundStatuses.BASIS_PASS_NO_ENQUIRIES, from, until);
    }
}