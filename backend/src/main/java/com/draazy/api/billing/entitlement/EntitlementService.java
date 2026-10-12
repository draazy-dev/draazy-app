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

    /** Free-tier floor, also what a null {@code listing_limit} resolves to. */
    private static final int DEFAULT_FREE_LISTING_LIMIT = 1;

    /** Integer division: fewer than three referrals earn no slot. */
    private static final int REFERRALS_PER_LISTING_SLOT = 3;

    /** Separate from {@link #REFERRALS_PER_LISTING_SLOT}: two offers that may reprice independently. */
    private static final int REFERRALS_PER_FREE_AGREEMENT = 3;

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

    /** Computes both together to avoid running two queries twice. */
    @Transactional(readOnly = true)
    public EntitlementsDto forUser(UUID userId) {
        Optional<Plan> plan = subscriptions.entitlingPlan(userId);
        long granting = referrals.countGrantingFor(userId);

        int contactBonus = Math.toIntExact(granting * settings.referralContactBonus());
        List<Instant> contacted = usage.contactTimes(userId);
        long used = contacted.size();

        ContactEntitlementDto contacts;
        if (plan.map(Plan::isUnlimitedContacts).orElse(false)) {
            // Still reports the bonus so an unlimited subscriber sees their referrals honoured
            // when they downgrade.
            contacts = new ContactEntitlementDto(true, used, null, null, contactBonus, null, null);
        } else {
            ContactAllocator.Standing standing = standingOf(userId, contacted, contactBonus);
            contacts = new ContactEntitlementDto(false, used, Math.toIntExact(used) + standing.remaining(),
                    standing.remaining(), contactBonus, iso(standing.freeWindowEndsAt()),
                    iso(standing.packExpiresAt()));
        }

        int listingBonus = Math.toIntExact(granting / REFERRALS_PER_LISTING_SLOT);
        List<ListingEntitlementDto.Pass> passes = subscriptions.listingPasses(userId).stream()
                .map(s -> new ListingEntitlementDto.Pass(s.getPropertyId().toString(), iso(s.getRenewsAt())))
                .toList();
        ListingEntitlementDto listings = new ListingEntitlementDto(
                freeListingSlots(plan, listingBonus), listingBonus, slots.listingSlotsHeld(userId), passes);

        AgreementEntitlementDto agreements = agreementsOf(userId, granting);

        return new EntitlementsDto(contacts, listings, agreements);
    }

    private ContactAllocator.Standing standingOf(UUID userId, List<Instant> contacted, int contactBonus) {
        return ContactAllocator.allocate(contacted, Math.toIntExact(settings.freeContactLimit()),
                subscriptions.contactPacks(userId), contactBonus, Instant.now());
    }

    private static int freeListingSlots(Optional<Plan> plan, int listingBonus) {
        return plan.map(Plan::getListingLimit).orElse(DEFAULT_FREE_LISTING_LIMIT) + listingBonus;
    }

    private static String iso(Instant at) {
        return Objects.toString(at, null);
    }

    /** Spendable at rent-agreement checkout; zero when every earned credit is already held by a request. */
    @Transactional(readOnly = true)
    public int freeAgreementsRemaining(UUID userId) {
        return agreementsOf(userId, referrals.countGrantingFor(userId)).remaining();
    }

    private AgreementEntitlementDto agreementsOf(UUID userId, long granting) {
        int earned = Math.toIntExact(granting / REFERRALS_PER_FREE_AGREEMENT);
        int used = Math.toIntExact(agreementCredits.agreementCreditsHeld(userId));
        return new AgreementEntitlementDto(earned, used, Math.max(0, earned - used));
    }

    /** Ceiling-only path for the listing gate; skips the contact and agreement halves. */
    @Override
    @Transactional(readOnly = true)
    public int listingAllowance(UUID userId) {
        return freeListingSlots(subscriptions.entitlingPlan(userId),
                Math.toIntExact(referrals.countGrantingFor(userId) / REFERRALS_PER_LISTING_SLOT));
    }

    /** Remaining-only path for the contact gate; skips the listing and agreement halves. */
    @Override
    @Transactional(readOnly = true)
    public OptionalInt contactsRemaining(UUID userId) {
        if (subscriptions.entitlingPlan(userId).map(Plan::isUnlimitedContacts).orElse(false)) {
            return OptionalInt.empty();
        }
        int contactBonus = Math.toIntExact(referrals.countGrantingFor(userId) * settings.referralContactBonus());
        return OptionalInt.of(standingOf(userId, usage.contactTimes(userId), contactBonus).remaining());
    }
}
