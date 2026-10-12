package com.draazy.api.billing.entitlement;

import com.draazy.api.billing.plan.Plan;
import com.draazy.api.billing.plan.SubscriptionService;
import com.draazy.api.billing.referral.ReferralRepository;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.trust.AgreementCreditUsageLookup;
import com.draazy.api.common.trust.ContactAllowanceLookup;
import com.draazy.api.common.trust.ContactUsageLookup;
import com.draazy.api.common.trust.ListingAllowanceLookup;
import com.draazy.api.common.trust.ListingSlotLookup;
import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.OptionalInt;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Owner contacts and listing slots from the free tier, passes, packs and referrals. */
@Service
public class EntitlementService implements ContactAllowanceLookup, ListingAllowanceLookup {

    // Free-tier floor, also what a null listing_limit resolves to.
    private static final int DEFAULT_FREE_LISTING_LIMIT = 1;

    private final SubscriptionService subscriptions;
    private final ReferralRepository referrals;
    private final ContactUsageLookup usage;
    private final PlatformSettings settings;
    private final ListingSlotLookup slots;
    private final AgreementCreditUsageLookup agreementCredits;

    public EntitlementService(SubscriptionService subscriptions, ReferralRepository referrals,
            ContactUsageLookup usage, PlatformSettings settings, ListingSlotLookup slots,
            AgreementCreditUsageLookup agreementCredits) {
        this.subscriptions = subscriptions;
        this.referrals = referrals;
        this.usage = usage;
        this.settings = settings;
        this.slots = slots;
        this.agreementCredits = agreementCredits;
    }

    /** Computes everything together to avoid running the same queries twice. */
    @Transactional(readOnly = true)
    public EntitlementsDto forUser(UUID userId) {
        Optional<Plan> plan = subscriptions.entitlingPlan(userId);
        int contactBonus = referralContacts(userId);
        int friendBonus = friendBonus(userId);
        List<Instant> contacted = usage.contactTimes(userId);
        long used = contacted.size();

        ContactEntitlementDto contacts;
        if (plan.map(Plan::isUnlimitedContacts).orElse(false)) {
            // Still reports the bonuses so an unlimited subscriber sees them honoured on downgrade.
            contacts = new ContactEntitlementDto(true, used, null, null, contactBonus, friendBonus, null, null);
        } else {
            ContactAllocator.Standing standing = standingOf(userId, contacted, contactBonus, friendBonus);
            contacts = new ContactEntitlementDto(false, used, Math.toIntExact(used) + standing.remaining(),
                    standing.remaining(), contactBonus, friendBonus, iso(standing.freeWindowEndsAt()),
                    iso(standing.packExpiresAt()));
        }

        List<ListingEntitlementDto.Pass> passes = subscriptions.listingPasses(userId).stream()
                .map(s -> new ListingEntitlementDto.Pass(s.getPropertyId().toString(), iso(s.getRenewsAt())))
                .toList();
        ListingEntitlementDto listings = new ListingEntitlementDto(
                freeListingSlots(plan), slots.listingSlotsHeld(userId), passes);

        return new EntitlementsDto(contacts, listings, agreementsOf(userId));
    }

    private ContactAllocator.Standing standingOf(UUID userId, List<Instant> contacted, int contactBonus,
            int friendBonus) {
        return ContactAllocator.allocate(contacted, Math.toIntExact(settings.freeContactLimit()) + friendBonus,
                subscriptions.contactPacks(userId), contactBonus, Instant.now());
    }

    private static int freeListingSlots(Optional<Plan> plan) {
        return plan.map(Plan::getListingLimit).orElse(DEFAULT_FREE_LISTING_LIMIT);
    }

    private static String iso(Instant at) {
        return Objects.toString(at, null);
    }

    // Granted rows are summed per track; rows with no track predate the tracks and earn owner contacts.
    private int referralContacts(UUID userId) {
        return Math.toIntExact(((Number) referrals.grantedByTrack(userId).getFirst()[1]).longValue()
                * settings.referralContactBonus());
    }

    private int friendBonus(UUID userId) {
        return referrals.friendContactBonusStands(userId) ? Math.toIntExact(settings.referralSeekerBonusContacts()) : 0;
    }

    /** Spendable at rent-agreement checkout; zero when every earned credit is already held by a request. */
    @Transactional(readOnly = true)
    public int freeAgreementsRemaining(UUID userId) {
        return agreementsOf(userId).remaining();
    }

    private AgreementEntitlementDto agreementsOf(UUID userId) {
        int earned = Math.toIntExact(((Number) referrals.grantedByTrack(userId).getFirst()[0]).longValue()
                * settings.referralOwnerRewardAgreements());
        int used = Math.toIntExact(agreementCredits.agreementCreditsHeld(userId));
        return new AgreementEntitlementDto(earned, used, Math.max(0, earned - used));
    }

    /** Ceiling-only path for the listing gate; skips the contact and agreement halves. */
    @Override
    @Transactional(readOnly = true)
    public int listingAllowance(UUID userId) {
        return freeListingSlots(subscriptions.entitlingPlan(userId));
    }

    /** Remaining-only path for the contact gate; skips the listing and agreement halves. */
    @Override
    @Transactional(readOnly = true)
    public OptionalInt contactsRemaining(UUID userId) {
        if (subscriptions.entitlingPlan(userId).map(Plan::isUnlimitedContacts).orElse(false)) {
            return OptionalInt.empty();
        }
        return OptionalInt.of(standingOf(userId, usage.contactTimes(userId), referralContacts(userId),
                friendBonus(userId)).remaining());
    }
}
