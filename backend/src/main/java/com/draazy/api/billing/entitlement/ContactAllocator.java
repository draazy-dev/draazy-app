package com.draazy.api.billing.entitlement;

import com.draazy.api.billing.plan.ContactPackTerm;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** Derives what is left from history: each past contact is spent on the earliest-expiring valid bucket. */
final class ContactAllocator {

    static final Duration FREE_WINDOW = Duration.ofDays(30);

    /** The free-window end is null before the first contact; the pack end is null with no pack contacts left. */
    record Standing(int remaining, Instant freeWindowEndsAt, Instant packExpiresAt) {
    }

    private static final class Bucket {
        final Instant from;
        final Instant until;
        final boolean pack;
        int left;

        Bucket(Instant from, Instant until, int capacity, boolean pack) {
            this.from = from;
            this.until = until;
            this.left = capacity;
            this.pack = pack;
        }

        boolean validAt(Instant t) {
            return (from == null || !t.isBefore(from)) && (until == null || t.isBefore(until));
        }
    }

    private static final Comparator<Bucket> SOONEST_EXPIRY = Comparator.comparing(
            (Bucket b) -> b.until, Comparator.nullsLast(Comparator.naturalOrder()));

    private ContactAllocator() {
    }

    /** @param contacts when each contact was opened, oldest first */
    static Standing allocate(List<Instant> contacts, int freeCapacity, List<ContactPackTerm> packs,
            int referralCapacity, Instant now) {
        Instant freeEnds = contacts.isEmpty() ? null : contacts.get(0).plus(FREE_WINDOW);
        List<Bucket> buckets = new ArrayList<>();
        buckets.add(new Bucket(null, freeEnds, freeCapacity, false));
        packs.forEach(p -> buckets.add(new Bucket(p.from(), p.until(), p.capacity(), true)));
        buckets.add(new Bucket(null, null, referralCapacity, false));

        for (Instant at : contacts) {
            buckets.stream()
                    .filter(b -> b.left > 0 && b.validAt(at))
                    .min(SOONEST_EXPIRY)
                    .ifPresent(b -> b.left--);
        }

        int remaining = buckets.stream().filter(b -> b.validAt(now)).mapToInt(b -> b.left).sum();
        Instant packExpires = buckets.stream()
                .filter(b -> b.pack && b.left > 0 && b.validAt(now))
                .map(b -> b.until)
                .min(Comparator.naturalOrder())
                .orElse(null);
        return new Standing(remaining, freeEnds, packExpires);
    }
}
