package com.draazy.api.billing.entitlement;

import com.draazy.api.billing.plan.ContactPackTerm;
import com.draazy.api.common.trust.ContactUse;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;

final class ContactAllocator {
    static final Duration FREE_WINDOW = Duration.ofDays(30);
    static final String RENT = "rent";
    static final String BUY = "buy";

    record Standing(int remaining, int remainingRent, int remainingBuy, Instant freeWindowEndsAt,
            Instant packExpiresAt) {
        int remainingFor(String deal) {
            return BUY.equals(deal) ? remainingBuy : RENT.equals(deal) ? remainingRent : remaining;
        }
    }

    private static final class Bucket {
        final Instant from;
        final Instant until;
        final boolean pack;
        final Instant frozenAt;
        final String deal;
        int left;

        Bucket(Instant from, Instant until, int capacity, boolean pack, Instant frozenAt, String deal) {
            this.from = from;
            this.until = until;
            this.left = capacity;
            this.pack = pack;
            this.frozenAt = frozenAt;
            this.deal = deal;
        }

        boolean validAt(Instant t) {
            return (from == null || !t.isBefore(from)) && (until == null || t.isBefore(until))
                    && (frozenAt == null || t.isBefore(frozenAt));
        }

        // A contact whose listing deal is unknown may draw on any bucket rather than vanish from the history.
        boolean serves(String contactDeal) {
            return deal == null || contactDeal == null || deal.equals(contactDeal);
        }
    }

    private static final Comparator<Bucket> SOONEST_EXPIRY = Comparator
            .comparing((Bucket b) -> b.until, Comparator.nullsLast(Comparator.naturalOrder()))
            .thenComparing(b -> b.deal == null);

    private ContactAllocator() {
    }

    static Standing allocate(List<ContactUse> contacts, int freeCapacity, List<ContactPackTerm> packs,
            Instant now) {
        Instant freeEnds = freeEnds(contacts);
        List<Bucket> buckets = replay(contacts, freeEnds, freeCapacity, packs);

        Predicate<Bucket> usable = b -> b.frozenAt == null && b.validAt(now);
        Instant packExpires = buckets.stream()
                .filter(b -> b.pack && b.left > 0 && usable.test(b))
                .map(b -> b.until)
                .min(Comparator.naturalOrder())
                .orElse(null);
        return new Standing(left(buckets, usable), left(buckets, usable.and(b -> b.serves(RENT))),
                left(buckets, usable.and(b -> b.serves(BUY))), freeEnds, packExpires);
    }

    static Map<UUID, Integer> spentFromPacks(List<ContactUse> contacts, int freeCapacity,
            List<ContactPackTerm> packs) {
        List<Bucket> buckets = replay(contacts, freeEnds(contacts), freeCapacity, packs);
        Map<UUID, Integer> spent = new HashMap<>();
        for (int i = 0; i < packs.size(); i++) {
            int used = packs.get(i).capacity() - buckets.get(i + 1).left;
            if (used > 0 && packs.get(i).subscriptionId() != null) {
                spent.put(packs.get(i).subscriptionId(), used);
            }
        }
        return spent;
    }

    private static Instant freeEnds(List<ContactUse> contacts) {
        return contacts.isEmpty() ? null : contacts.get(0).at().plus(FREE_WINDOW);
    }

    private static int left(List<Bucket> buckets, Predicate<Bucket> counted) {
        return buckets.stream().filter(counted).mapToInt(b -> b.left).sum();
    }

    private static List<Bucket> replay(List<ContactUse> contacts, Instant freeEnds, int freeCapacity,
            List<ContactPackTerm> packs) {
        List<Bucket> buckets = new ArrayList<>();
        buckets.add(new Bucket(null, freeEnds, freeCapacity, false, null, null));
        packs.forEach(p -> buckets.add(new Bucket(p.from(), p.until(), p.capacity(), true, p.frozenAt(), p.deal())));
        for (ContactUse use : contacts) {
            buckets.stream()
                    .filter(b -> b.left > 0 && b.validAt(use.at()) && b.serves(use.deal()))
                    .min(SOONEST_EXPIRY)
                    .ifPresent(b -> b.left--);
        }
        return buckets;
    }
}
