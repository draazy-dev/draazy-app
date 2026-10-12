package com.draazy.api.billing.entitlement;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.billing.plan.ContactPackTerm;
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

    private static List<Instant> contactsOn(int count, int dayNumber) {
        return IntStream.range(0, count).mapToObj(i -> day(dayNumber).plusSeconds(i)).toList();
    }

    @Test
    @DisplayName("the free window opens at the first contact and is open-ended before it")
    void freeWindowStartsAtTheFirstContact() {
        var none = ContactAllocator.allocate(List.of(), 15, List.of(), 0, day(100));
        assertThat(none.remaining()).isEqualTo(15);
        assertThat(none.freeWindowEndsAt()).isNull();

        var first = ContactAllocator.allocate(contactsOn(3, 0), 15, List.of(), 0, day(10));
        assertThat(first.remaining()).isEqualTo(12);
        assertThat(first.freeWindowEndsAt()).isEqualTo(day(30));
    }

    @Test
    @DisplayName("unspent free contacts lapse thirty days after the first one")
    void freeContactsExpire() {
        var standing = ContactAllocator.allocate(contactsOn(3, 0), 15, List.of(), 0, day(31));

        assertThat(standing.remaining()).isZero();
    }

    @Test
    @DisplayName("packs stack, and the one that lapses first is spent first")
    void packsStackAndTheSoonestExpiryIsSpentFirst() {
        var early = new ContactPackTerm(day(0), day(30), 15);
        var late = new ContactPackTerm(day(0), day(60), 15);

        var standing = ContactAllocator.allocate(contactsOn(10, 1), 0, List.of(early, late), 0, day(5));

        assertThat(standing.remaining()).isEqualTo(20);
        assertThat(standing.packExpiresAt()).isEqualTo(day(30));
    }

    @Test
    @DisplayName("a pack's leftovers vanish when it lapses, and later packs are untouched")
    void anExpiredPackLeavesNothing() {
        var old = new ContactPackTerm(day(0), day(30), 15);
        var fresh = new ContactPackTerm(day(40), day(70), 15);

        var standing = ContactAllocator.allocate(contactsOn(5, 1), 0, List.of(old, fresh), 0, day(45));

        assertThat(standing.remaining()).isEqualTo(15);
        assertThat(standing.packExpiresAt()).isEqualTo(day(70));
    }

    @Test
    @DisplayName("referral contacts never expire and are spent last")
    void referralContactsAreSpentLast() {
        var pack = new ContactPackTerm(day(0), day(30), 15);

        var spendingPackFirst = ContactAllocator.allocate(contactsOn(10, 1), 0, List.of(pack), 30, day(5));
        assertThat(spendingPackFirst.remaining()).isEqualTo(35);

        var afterPackLapses = ContactAllocator.allocate(contactsOn(10, 1), 0, List.of(pack), 30, day(90));
        assertThat(afterPackLapses.remaining()).isEqualTo(30);
        assertThat(afterPackLapses.packExpiresAt()).isNull();
    }

    @Test
    @DisplayName("a contact opened with nothing valid is ignored, not charged to a later bucket")
    void unassignableContactsAreIgnored() {
        var pack = new ContactPackTerm(day(50), day(80), 15);

        var standing = ContactAllocator.allocate(contactsOn(20, 0), 15, List.of(pack), 0, day(60));

        assertThat(standing.remaining()).isEqualTo(15);
    }
}
