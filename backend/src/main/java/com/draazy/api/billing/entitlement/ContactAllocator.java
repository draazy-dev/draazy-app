package com.draazy.api.billing.entitlement;

import com.draazy.api.billing.plan.ContactPackTerm;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

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
        final Instant frozenAt;
        int left;

        Bucket(Instant from, Instant until, int capacity, boolean pack, Instant frozenAt) {
            this.from = from;
            this.until = until;
            this.left = capacity;
            this.pack = pack;
            this.frozenAt = frozenAt;
        }

        boolean validAt(Instant t) {
            return (from == null || !t.isBefore(from)) && (until == null || t.isBefore(until))
                    && (frozenAt == null || t.isBefore(frozenAt));
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
        List<Bucket> buckets = replay(contacts, freeEnds, freeCapacity, packs, referralCapacity);

        int remaining = buckets.stream().filter(b -> b.frozenAt == null && b.validAt(now)).mapToInt(b -> b.left).sum();
        Instant packExpires = buckets.stream()
                .filter(b -> b.pack && b.left > 0 && b.frozenAt == null && b.validAt(now))
                .map(b -> b.until)
                .min(Comparator.naturalOrder())
                .orElse(null);
        return new Standing(remaining, freeEnds, packExpires);
    }

    /** Contacts the replay drew from each pack, by subscription id; a pack with none is absent from the map. */
    static Map<UUID, Integer> spentFromPacks(List<Instant> contacts, int freeCapacity,
            List<ContactPackTerm> packs, int referralCapacity) {
        Instant freeEnds = contacts.isEmpty() ? null : contacts.get(0).plus(FREE_WINDOW);
        List<Bucket> buckets = replay(contacts, freeEnds, freeCapacity, packs, referralCapacity);
        Map<UUID, Integer> spent = new HashMap<>();
        for (int i = 0; i < packs.size(); i++) {
            int used = packs.get(i).capacity() - buckets.get(i + 1).left;
            if (used > 0 && packs.get(i).subscriptionId() != null) {
                spent.put(packs.get(i).subscriptionId(), used);
            }
        }
        return spent;
    }

    // Bucket order: free, then each pack in the order given, then referral.
    private static List<Bucket> replay(List<Instant> contacts, Instant freeEnds, int freeCapacity,
            List<ContactPackTerm> packs, int referralCapacity) {
        List<Bucket> buckets = new ArrayList<>();
        buckets.add(new Bucket(null, freeEnds, freeCapacity, false, null));
        packs.forEach(p -> buckets.add(new Bucket(p.from(), p.until(), p.capacity(), true, p.frozenAt())));
        buckets.add(new Bucket(null, null, referralCapacity, false, null));
        for (Instant at : contacts) {
            buckets.stream()
                    .filter(b -> b.left > 0 && b.validAt(at))
                    .min(SOONEST_EXPIRY)
                    .ifPresent(b -> b.left--);
        }
        return buckets;
    }
}
