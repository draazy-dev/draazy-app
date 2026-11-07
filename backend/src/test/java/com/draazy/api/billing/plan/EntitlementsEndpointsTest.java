package com.draazy.api.billing.plan;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Entitlements — the contact quota the browser used to keep")
class EntitlementsEndpointsTest extends AbstractApiTest {
    private static final String UNLIMITED_PLAN = "b1000000-0000-4000-8000-000000000002";

    private static final int FREE_LIMIT = 15;
    private static final int FRIEND_BONUS = 5;

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired SubscriptionRepository subscriptions;

    @Autowired PlanRepository plans;
    @Autowired TestPlanGrants grants;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Entitled " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private User identityVerified(String mobile, String role) {
        User u = user(mobile, role);
        u.setVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String title) {
        return listing(owner, title, "rent");
    }

    private Property listing(User owner, String title, String deal) {
        Property p = new Property(owner, title, deal, "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private int ask(User buyer, Property p) throws Exception {
        return mvc.perform(post(Routes.Contacts.REQUEST)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + p.getId() + "\"}"))
                .andReturn().getResponse().getStatus();
    }

    private void spend(User buyer, int count, long firstOwnerMobile) throws Exception {
        for (int i = 0; i < count; i++) {
            User owner = user(String.valueOf(firstOwnerMobile + i), "owner");
            assertThat(ask(buyer, listing(owner, "Flat " + i))).isEqualTo(200);
            jdbc.update("update contact_requests set status = 'approved' where requester_id = ?", buyer.getId());
        }
    }

    private void unlimitedPlan(User u) {
        subscriptions.saveAndFlush(new Subscription(u.getId(), UUID.fromString(UNLIMITED_PLAN), null,
                SubscriptionStatuses.ACTIVE, priceOf(UNLIMITED_PLAN), Instant.now(),
                Instant.now().plus(30, ChronoUnit.DAYS), null, null));
    }

    private long priceOf(String planId) {
        return plans.findById(UUID.fromString(planId)).orElseThrow().getPrice();
    }

    private String referralApprovedFor(User referrer, String refereeMobile, User staff)
            throws Exception {
        User referee = identityVerified(refereeMobile, "buyer");
        String code = mvc.perform(get(Routes.Referrals.MINE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andReturn().getResponse().getContentAsString()
                .replaceAll("^.*?\"code\":\"([^\"]+)\".*$", "$1");

        mvc.perform(post(Routes.Referrals.REDEEM)
                        .header(HttpHeaders.AUTHORIZATION, bearer(referee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().isOk());

        String id = mvc.perform(get(Routes.Referrals.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andReturn().getResponse().getContentAsString()
                .replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");

        mvc.perform(post(Routes.Referrals.BASE + "/" + id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk());
        return id;
    }

    @Test
    @DisplayName("a brand-new account is told the free allowance, not left to assume one")
    void freeTierReportsItsAllowance() throws Exception {
        User u = user("9844400001", "buyer");

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contacts.unlimited").value(false))
                .andExpect(jsonPath("$.contacts.used").value(0))
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT))
                .andExpect(jsonPath("$.contacts.remaining").value(FREE_LIMIT))
                .andExpect(jsonPath("$.contacts.referralBonus").doesNotExist())
                .andExpect(jsonPath("$.contacts.friendBonus").value(0))
                .andExpect(jsonPath("$.agreements.credits").value(0))
                .andExpect(jsonPath("$.agreements.remaining").value(0))
                .andExpect(jsonPath("$.agreements.discountPercent").value(50))
                .andExpect(jsonPath("$.listings.allowance").value(1))
                .andExpect(jsonPath("$.listings.referralBonus").doesNotExist())
                .andExpect(jsonPath("$.listings.used").value(0));
    }

    @Test
    @DisplayName("the free window opens at the first contact; a pack adds its contacts and its expiry")
    void freeWindowAndPackAreReported() throws Exception {
        User buyer = user("9844400030", "buyer");

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.freeWindowEndsAt").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.contacts.packExpiresAt").value(org.hamcrest.Matchers.nullValue()));

        spend(buyer, 1, 9844400031L);
        grants.grantPack(buyer.getId(), Instant.now(), Instant.now().plus(30, ChronoUnit.DAYS));

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.unlimited").value(false))
                .andExpect(jsonPath("$.contacts.used").value(1))
                .andExpect(jsonPath("$.contacts.remaining").value(FREE_LIMIT + 15 - 1))
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT + 15))
                .andExpect(jsonPath("$.contacts.freeWindowEndsAt").isString())
                .andExpect(jsonPath("$.contacts.packExpiresAt").isString());
    }

    @Test
    @DisplayName("a pack lets a buyer whose free contacts are spent carry on")
    void aPackReopensAnExhaustedBuyer() throws Exception {
        User buyer = user("9844400040", "buyer");
        spend(buyer, FREE_LIMIT, 9844400041L);
        assertThat(ask(buyer, listing(user("9844400070", "owner"), "One too many"))).isEqualTo(422);

        grants.grantPack(buyer.getId(), Instant.now(), Instant.now().plus(30, ChronoUnit.DAYS));

        assertThat(ask(buyer, listing(user("9844400071", "owner"), "Now allowed"))).isEqualTo(200);
    }

    @Test
    @DisplayName("a buy pack opens sale listings only, and the refusal names the pack that would")
    void aBuyPackNeverPaysForARentContact() throws Exception {
        User buyer = user("9844400140", "buyer");
        spend(buyer, FREE_LIMIT, 9844400141L);
        // One test transaction stamps every contact alike; the replay needs the rent ones first.
        jdbc.update("update contact_requests set first_requested_at = first_requested_at - interval '1 minute'"
                + " where requester_id = ?", buyer.getId());
        grants.grantBuyPack(buyer.getId(), Instant.now().minus(1, ChronoUnit.HOURS),
                Instant.now().plus(60, ChronoUnit.DAYS));

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.remaining").value(15))
                .andExpect(jsonPath("$.contacts.remainingRent").value(0))
                .andExpect(jsonPath("$.contacts.remainingBuy").value(15));

        mvc.perform(post(Routes.Contacts.REQUEST)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + listing(user("9844400170", "owner"), "Rent flat").getId()
                                + "\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message", org.hamcrest.Matchers.containsString("Rent Contact Pack")));

        assertThat(ask(buyer, listing(user("9844400171", "owner"), "Sale flat", "buy"))).isEqualTo(200);
        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.remainingBuy").value(14));
    }

    @Test
    @DisplayName("free contacts count toward either deal until spent")
    void freeContactsServeBothDeals() throws Exception {
        User buyer = user("9844400180", "buyer");
        assertThat(ask(buyer, listing(user("9844400181", "owner"), "Sale home", "buy"))).isEqualTo(200);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.remaining").value(FREE_LIMIT - 1))
                .andExpect(jsonPath("$.contacts.remainingRent").value(FREE_LIMIT - 1))
                .andExpect(jsonPath("$.contacts.remainingBuy").value(FREE_LIMIT - 1));
    }

    @Test
    @DisplayName("a listing with a seeker contact or a pass cannot flip between rent and sale")
    void aPricedListingKeepsItsDeal() throws Exception {
        User owner = user("9844400190", "owner");
        Property contacted = listing(owner, "Contacted flat");
        assertThat(ask(user("9844400191", "buyer"), contacted)).isEqualTo(200);
        assertThat(flipToSale(owner, contacted)).isEqualTo(409);

        Property passed = listing(owner, "Passed flat");
        grants.grantPass(owner.getId(), passed.getId(), Instant.now().plus(60, ChronoUnit.DAYS));
        assertThat(flipToSale(owner, passed)).isEqualTo(409);

        assertThat(flipToSale(owner, listing(owner, "Quiet flat"))).isEqualTo(200);
    }

    private int flipToSale(User owner, Property p) throws Exception {
        return mvc.perform(patch("/me/listings/" + p.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"deal\":\"buy\",\"price\":5000000}"))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("the count is contact_requests itself — no tally to drift")
    void openingAContactSpendsExactlyOne() throws Exception {
        User buyer = user("9844400010", "buyer");
        spend(buyer, 2, 9844400011L);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.used").value(2))
                .andExpect(jsonPath("$.contacts.remaining").value(FREE_LIMIT - 2));
    }

    @Test
    @DisplayName("asking the same owner twice costs one contact, not two")
    void reReadingAnOpenRequestIsFree() throws Exception {
        User buyer = user("9844400020", "buyer");
        Property p = listing(user("9844400021", "owner"), "Repeat flat");

        assertThat(ask(buyer, p)).isEqualTo(200);
        assertThat(ask(buyer, p)).isEqualTo(200);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.used").value(1));
    }

    @Test
    @DisplayName("an owner opening their own listing spends nothing — the check runs after that branch")
    void anOwnerNeverSpendsOnTheirOwnListing() throws Exception {
        User owner = user("9844400030", "owner");

        assertThat(ask(owner, listing(owner, "My own flat"))).isEqualTo(409);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.contacts.used").value(0));
    }

    @Test
    @DisplayName("the sixteenth new owner is refused with 422, not 403 and not 429")
    void exhaustingTheQuotaRefusesTheNextNewOwner() throws Exception {
        User buyer = user("9844401000", "buyer");
        spend(buyer, FREE_LIMIT, 9844401001L);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(jsonPath("$.contacts.remaining").value(0));

        Property oneTooMany = listing(user("9844401099", "owner"), "One too many");
        mvc.perform(post(Routes.Contacts.REQUEST)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + oneTooMany.getId() + "\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("contact_quota_exhausted"));
    }

    @Test
    @DisplayName("an exhausted caller can still re-read the requests they already opened")
    void exhaustionNeverClosesADoorAlreadyOpened() throws Exception {
        User buyer = user("9844402000", "buyer");
        User owner = user("9844402001", "owner");
        Property first = listing(owner, "Already asked");

        assertThat(ask(buyer, first)).isEqualTo(200);
        spend(buyer, FREE_LIMIT - 1, 9844402010L);

        assertThat(ask(buyer, first)).isEqualTo(200);
        assertThat(ask(buyer, listing(user("9844402099", "owner"), "Blocked")))
                .isEqualTo(422);
    }

    @Test
    @DisplayName("a qualified referral buys the referrer a discount credit, never contacts")
    void anApprovedReferralGrantsAnAgreementDiscount() throws Exception {
        User referrer = user("9844403000", "owner");
        User staff = user("9844403009", "staff");
        referralApprovedFor(referrer, "9844403001", staff);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT))
                .andExpect(jsonPath("$.contacts.remaining").value(FREE_LIMIT))
                .andExpect(jsonPath("$.contacts.referralBonus").doesNotExist())
                .andExpect(jsonPath("$.listings.referralBonus").doesNotExist())
                .andExpect(jsonPath("$.listings.allowance").value(1))
                .andExpect(jsonPath("$.agreements.credits").value(1))
                .andExpect(jsonPath("$.agreements.used").value(0))
                .andExpect(jsonPath("$.agreements.remaining").value(1))
                .andExpect(jsonPath("$.agreements.discountPercent").value(50));
    }

    @Test
    @DisplayName("each qualified friend adds one credit, whichever track they came in on")
    void everyQualifiedFriendBuysACredit() throws Exception {
        User referrer = user("9844403100", "owner");
        User staff = user("9844403109", "staff");
        String first = referralApprovedFor(referrer, "9844403101", staff);
        jdbc.update("update referrals set track = 'owner' where id = ?::uuid", first);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT))
                .andExpect(jsonPath("$.listings.allowance").value(1))
                .andExpect(jsonPath("$.agreements.credits").value(1));

        referralApprovedFor(referrer, "9844403102", staff);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(jsonPath("$.listings.allowance").value(1))
                .andExpect(jsonPath("$.agreements.credits").value(2))
                .andExpect(jsonPath("$.agreements.remaining").value(2));
    }

    @Test
    @DisplayName("the friend's gift waits for the referral to qualify, and goes on rejection")
    void theFriendBonusFollowsTheReferral() throws Exception {
        User referrer = user("9844403200", "owner");
        User staff = user("9844403209", "staff");
        String id = referralApprovedFor(referrer, "9844403201", staff);
        User referee = users.findByMobile("9844403201").orElseThrow();

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(referee)))
                .andExpect(jsonPath("$.contacts.friendBonus").value(FRIEND_BONUS))
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT + FRIEND_BONUS))
                .andExpect(jsonPath("$.contacts.remaining").value(FREE_LIMIT + FRIEND_BONUS));

        jdbc.update("update referrals set status = 'pending' where id = ?::uuid", id);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(referee)))
                .andExpect(jsonPath("$.contacts.friendBonus").value(0));

        jdbc.update("update referrals set status = 'rejected' where id = ?::uuid", id);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(referee)))
                .andExpect(jsonPath("$.contacts.friendBonus").value(0))
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT));
    }

    @Test
    @DisplayName("clawing back withdraws the credit, because nothing was ever stored")
    void clawingBackAReferralWithdrawsTheCreditItGranted() throws Exception {
        User referrer = user("9844404000", "owner");
        User staff = user("9844404009", "staff");
        String id = referralApprovedFor(referrer, "9844404001", staff);

        mvc.perform(post(Routes.Referrals.BASE + "/" + id + "/clawback")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Fraud ring\"}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Plans.ENTITLEMENTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT))
                .andExpect(jsonPath("$.agreements.credits").value(0))
                .andExpect(jsonPath("$.agreements.remaining").value(0));
    }

    @Test
    @DisplayName("an unlimited plan reports null rather than a number nobody can read")
    void aPricedPlanLiftsTheCeiling() throws Exception {
        User u = user("9844405000", "owner");
        unlimitedPlan(u);
        spend(u, 1, 9844405001L);

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contacts.unlimited").value(true))
                .andExpect(jsonPath("$.contacts.allowance").doesNotExist())
                .andExpect(jsonPath("$.contacts.remaining").doesNotExist())
                .andExpect(jsonPath("$.contacts.used").value(1))
                .andExpect(jsonPath("$.listings.allowance").value(2));
    }

    @Test
    @DisplayName("an unpaid order confers nothing — capability is not the same question as standing")
    void aPendingSubscriptionEntitlesNothing() throws Exception {
        User u = user("9844406000", "owner");
        subscriptions.saveAndFlush(new Subscription(u.getId(), UUID.fromString(UNLIMITED_PLAN), null,
                SubscriptionStatuses.PENDING, priceOf(UNLIMITED_PLAN), Instant.now(), null, null, null));

        mvc.perform(get(Routes.Plans.ENTITLEMENTS).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contacts.unlimited").value(false))
                .andExpect(jsonPath("$.contacts.allowance").value(FREE_LIMIT))
                .andExpect(jsonPath("$.listings.allowance").value(1));
    }

    @Test
    @DisplayName("entitlements are the caller's own — there is no id on this route to tamper with")
    void theRouteIsAuthenticated() throws Exception {
        mvc.perform(get(Routes.Plans.ENTITLEMENTS))
                .andExpect(status().isUnauthorized());
    }
}
