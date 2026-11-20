package com.draazy.api.billing.entitlement;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.billing.plan.ContactPackTerm;
import com.draazy.api.common.trust.ContactUse;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("ContactAllocator — what is left is derived from history")
class ContactAllocatorTest {

    private static final Instant T0 = Instant.parse("2026-01-01T00:00:00Z");

    private static Instant day(int n) {
        return T0.plus(n, ChronoUnit.DAYS);
    }

    private static List<ContactUse> contactsOn(int count, int dayNumber) {
        return contactsOn(count, dayNumber, "rent");
    }

    private static List<ContactUse> contactsOn(int count, int dayNumber, String deal) {
        return IntStream.range(0, count).mapToObj(i -> new ContactUse(day(dayNumber).plusSeconds(i), deal)).toList();
    }

    private static ContactPackTerm pack(int fromDay, int untilDay, String deal) {
        return new ContactPackTerm(null, day(fromDay), day(untilDay), 15, null, deal);
    }

    @Test
    @DisplayName("the free window opens at the first contact and is open-ended before it")
    void freeWindowStartsAtTheFirstContact() {
        var none = ContactAllocator.allocate(List.of(), 15, List.of(), day(100));
        assertThat(none.remaining()).isEqualTo(15);
        assertThat(none.freeWindowEndsAt()).isNull();

        var first = ContactAllocator.allocate(contactsOn(3, 0), 15, List.of(), day(10));
        assertThat(first.remaining()).isEqualTo(12);
        assertThat(first.freeWindowEndsAt()).isEqualTo(day(30));
    }

    @Test
    @DisplayName("unspent free contacts lapse thirty days after the first one")
    void freeContactsExpire() {
        var standing = ContactAllocator.allocate(contactsOn(3, 0), 15, List.of(), day(31));

        assertThat(standing.remaining()).isZero();
    }

    @Test
    @DisplayName("packs stack, and the one that lapses first is spent first")
    void packsStackAndTheSoonestExpiryIsSpentFirst() {
        var early = new ContactPackTerm(day(0), day(30), 15);
        var late = new ContactPackTerm(day(0), day(60), 15);

        var standing = ContactAllocator.allocate(contactsOn(10, 1), 0, List.of(early, late), day(5));

        assertThat(standing.remaining()).isEqualTo(20);
        assertThat(standing.packExpiresAt()).isEqualTo(day(30));
    }

    @Test
    @DisplayName("a frozen pack keeps the contacts it already served but supplies no more")
    void aFrozenPackKeepsItsHistoryAndLendsNothing() {
        var frozen = new ContactPackTerm(null, day(0), day(30), 15, day(5), null);
        var live = new ContactPackTerm(day(0), day(60), 15);

        var beforeFreeze = ContactAllocator.allocate(contactsOn(3, 1), 0, List.of(frozen, live), day(6));
        assertThat(beforeFreeze.remaining()).isEqualTo(15);

        var afterFreeze = ContactAllocator.allocate(
                java.util.stream.Stream.concat(contactsOn(3, 1).stream(), contactsOn(2, 7).stream()).toList(),
                0, List.of(frozen, live), day(8));
        assertThat(afterFreeze.remaining()).isEqualTo(13);
        assertThat(afterFreeze.packExpiresAt()).isEqualTo(day(60));
    }

    @Test
    @DisplayName("a pack's leftovers vanish when it lapses, and later packs are untouched")
    void anExpiredPackLeavesNothing() {
        var old = new ContactPackTerm(day(0), day(30), 15);
        var fresh = new ContactPackTerm(day(40), day(70), 15);

        var standing = ContactAllocator.allocate(contactsOn(5, 1), 0, List.of(old, fresh), day(45));

        assertThat(standing.remaining()).isEqualTo(15);
        assertThat(standing.packExpiresAt()).isEqualTo(day(70));
    }

    @Test
    @DisplayName("a contact opened with nothing valid is ignored, not charged to a later bucket")
    void unassignableContactsAreIgnored() {
        var pack = new ContactPackTerm(day(50), day(80), 15);

        var standing = ContactAllocator.allocate(contactsOn(20, 0), 15, List.of(pack), day(60));

        assertThat(standing.remaining()).isEqualTo(15);
    }

    @Test
    @DisplayName("a rent pack serves rent listings only, a buy pack sale listings only")
    void typedPacksServeTheirOwnDealOnly() {
        var standing = ContactAllocator.allocate(contactsOn(3, 1, "buy"), 0,
                List.of(pack(0, 30, "rent"), pack(0, 60, "buy")), day(5));

        assertThat(standing.remainingRent()).isEqualTo(15);
        assertThat(standing.remainingBuy()).isEqualTo(12);
        assertThat(standing.remaining()).isEqualTo(27);
    }

    @Test
    @DisplayName("a sale contact with only a rent pack left has nothing to draw on")
    void aRentPackNeverPaysForASaleContact() {
        var standing = ContactAllocator.allocate(contactsOn(2, 1, "buy"), 0, List.of(pack(0, 30, "rent")),
                day(5));

        assertThat(standing.remainingFor("buy")).isZero();
        assertThat(standing.remainingFor("rent")).isEqualTo(15);
    }

    @Test
    @DisplayName("free and pre-split packs serve both deals, and a typed pack is spent first on a tie")
    void sharedBucketsServeBothDealsAndTypedWinsTies() {
        var standing = ContactAllocator.allocate(contactsOn(4, 1, "rent"), 0,
                List.of(pack(0, 30, null), pack(0, 30, "rent")), day(5));

        assertThat(standing.remainingRent()).isEqualTo(15 + 11);
        assertThat(standing.remainingBuy()).isEqualTo(15);
    }

    @Test
    @DisplayName("refund maths counts only the contacts a typed pack actually paid for")
    void spentFromPacksFollowsTheDeal() {
        var rent = new ContactPackTerm(java.util.UUID.randomUUID(), day(0), day(30), 15, null, "rent");
        var buy = new ContactPackTerm(java.util.UUID.randomUUID(), day(0), day(60), 15, null, "buy");
        var contacts = java.util.stream.Stream.concat(contactsOn(2, 1, "rent").stream(),
                contactsOn(3, 2, "buy").stream()).toList();

        var spent = ContactAllocator.spentFromPacks(contacts, 0, List.of(rent, buy));

        assertThat(spent).containsEntry(rent.subscriptionId(), 2).containsEntry(buy.subscriptionId(), 3);
    }
}
