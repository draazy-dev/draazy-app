package com.draazy.api.billing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.referral.Referral;
import com.draazy.api.billing.referral.ReferralClawbacks;
import com.draazy.api.billing.referral.ReferralHolds;
import com.draazy.api.billing.referral.ReferralQualification;
import com.draazy.api.billing.referral.ReferralRepository;
import com.draazy.api.billing.referral.ReferralStatuses;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.trust.ReferralTriggers;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** The referral decision made without a desk: risk bands, hold, caps, clawback, the flag and redeem hardening. */
class ReferralAutomationTest extends AbstractApiTest {

    private static final String UA = "DraazyTest/1.0 (referral automation)";
    private static final String IP = "203.0.113.9";
    private static final String REFERRER_IP = "198.51.100.9";
    private static final String REFERRER_UA = "Referrer/2.0";

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired ReferralRepository referrals;
    @Autowired ReferralQualification qualification;
    @Autowired ReferralHolds holds;
    @Autowired ReferralClawbacks clawbacks;
    @Autowired ReferralTriggers triggers;
    @Autowired EntityManager entityManager;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Automation " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private User agedReferrer(String mobile) {
        User u = user(mobile, "owner");
        jdbc.update("update users set created_at = now() - interval '30 days' where id = ?", u.getId());
        entityManager.clear();
        return u;
    }

    private static String codeIn(String body) {
        int i = body.indexOf("\"code\":\"") + 8;
        return body.substring(i, body.indexOf('"', i));
    }

    private String mint(User referrer, String ip, String ua, String deviceId) throws Exception {
        var request = get(Routes.Referrals.MINE)
                .header(HttpHeaders.AUTHORIZATION, bearer(referrer))
                .header(HttpHeaders.USER_AGENT, ua)
                .with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                });
        if (deviceId != null) {
            request.header("X-Device-Id", deviceId);
        }
        return codeIn(mvc.perform(request).andReturn().getResponse().getContentAsString());
    }

    private int redeem(User caller, String code, String ip, String ua, String deviceId) throws Exception {
        var request = post(Routes.Referrals.REDEEM)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .header(HttpHeaders.USER_AGENT, ua)
                .with(r -> {
                    r.setRemoteAddr(ip);
                    return r;
                })
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\":\"" + code + "\"}");
        if (deviceId != null) {
            request.header("X-Device-Id", deviceId);
        }
        return mvc.perform(request).andReturn().getResponse().getStatus();
    }

    /** A pending referral from {@code referrer} to a fresh referee who came from a different network and browser. */
    private Referral pending(User referrer, String refereeMobile) throws Exception {
        User referee = user(refereeMobile, "owner");
        assertThat(redeem(referee, mint(referrer, REFERRER_IP, REFERRER_UA, null), IP, UA, "device-" + refereeMobile))
                .isEqualTo(200);
        return referrals.findByReferrerId(referrer.getId()).stream()
                .filter(r -> r.getReferredMobile().equals(refereeMobile)).findFirst().orElseThrow();
    }

    private UUID idOf(Referral referral) {
        return users.findByMobile(referral.getReferredMobile()).orElseThrow().getId();
    }

    private Property verifiedListing(User owner) {
        Property p = new Property(owner, "Automation flat", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        Property saved = properties.saveAndFlush(p);
        jdbc.update("update properties set ownership_verified = true, ownership_verified_at = now() where id = ?",
                saved.getId());
        entityManager.clear();
        return saved;
    }

    private Referral reload(Referral referral) {
        return referrals.findById(referral.getId()).orElseThrow();
    }

    private long auditRows(Referral referral, String action) {
        return jdbc.queryForObject("select count(*) from audit_log where entity = 'referral' and entity_id = ? "
                + "and action = ?", Long.class, referral.getId().toString(), action);
    }

    private void setFee(String key, long value) {
        jdbc.update("update settings set value = jsonb_set(value, ?::text[], ?::jsonb) where key = 'fees'",
                "{" + key + "}", String.valueOf(value));
        entityManager.clear();
    }

    /** Verifies a real listing of the referee's, so the referral reaches the decision and can later be re-checked. */
    private Referral qualifyByListing(Referral referral) {
        User referee = users.findByMobile(referral.getReferredMobile()).orElseThrow();
        qualification.announceOwnershipVerified(referee.getId(), verifiedListing(referee).getId(), Instant.now());
        return reload(referral);
    }

    // ---- tracks: the first event decides ----

    @Test
    void aFirstAcceptedContactQualifiesTheSeekerTrackAndTheListingThenAddsNothing() throws Exception {
        Referral referral = pending(agedReferrer("9866620010"), "9866620011");

        acceptContact(referral);
        Referral after = reload(referral);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
        assertThat(after.getTrack()).isEqualTo(ReferralStatuses.TRACK_SEEKER);
        assertThat(after.getHandledBy()).isEqualTo(ReferralStatuses.SYSTEM);
        assertThat(after.getGrantedAt()).isNotNull();

        qualification.announceOwnershipVerified(idOf(referral), UUID.randomUUID(), Instant.now());
        assertThat(reload(referral).getTrack()).isEqualTo(ReferralStatuses.TRACK_SEEKER);
        assertThat(referrals.findByReferrerId(referral.getReferrerId())).hasSize(1);
    }

    @Test
    void aListingFirstFixesTheOwnerTrackAndALaterContactAddsNothing() throws Exception {
        Referral referral = pending(agedReferrer("9866620020"), "9866620021");

        assertThat(qualifyByListing(referral).getTrack()).isEqualTo(ReferralStatuses.TRACK_OWNER);
        acceptContact(referral);

        assertThat(reload(referral).getTrack()).isEqualTo(ReferralStatuses.TRACK_OWNER);
    }

    // ---- seeker-track integrity ----

    private User otherOwner(Referral referral) {
        return user("97" + referral.getReferredMobile().substring(2), "owner");
    }

    private void acceptContact(Referral referral) {
        User owner = otherOwner(referral);
        acceptContact(referral, owner, verifiedListing(owner));
    }

    private void acceptContact(Referral referral, User approvingOwner, Property listing) {
        qualification.announceContactAccepted(
                idOf(referral), approvingOwner.getId(), listing.getId(), Instant.now());
    }

    @Test
    void theReferrerApprovingTheirOwnRefereesContactIsRejectedAsSelfDealing() throws Exception {
        User referrer = agedReferrer("9866620240");
        Referral referral = pending(referrer, "9866620241");

        acceptContact(referral, referrer, verifiedListing(referrer));

        Referral after = reload(referral);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.REJECTED);
        assertThat(after.getAutoReason()).isEqualTo("self_dealing");
        assertThat(after.getHandledBy()).isEqualTo(ReferralStatuses.SYSTEM);
        assertThat(auditRows(after, "referral.auto.rejected")).isEqualTo(1);
        assertThat(jdbc.queryForList("select body from notifications where user_id = ? and type = 'referral.outcome'",
                String.class, referrer.getId())).hasSize(1);
    }

    @Test
    void approvingThroughTheContactEndpointByTheReferrerIsRejectedAsSelfDealing() throws Exception {
        User referrer = agedReferrer("9866620300");
        Referral referral = pending(referrer, "9866620301");
        User referee = users.findByMobile(referral.getReferredMobile()).orElseThrow();
        Property listing = verifiedListing(referrer);
        mvc.perform(post(Routes.Contacts.REQUEST)
                .header(HttpHeaders.AUTHORIZATION, bearer(referee))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"propertyId\":\"" + listing.getId() + "\"}")).andExpect(status().isOk());
        UUID request = jdbc.queryForObject(
                "select id from contact_requests where requester_id = ?", UUID.class, referee.getId());

        mvc.perform(patch(Routes.MeContactRequests.BY_ID, request)
                        .header(HttpHeaders.AUTHORIZATION, bearer(referrer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"approved\"}"))
                .andExpect(status().isOk());

        entityManager.clear();
        assertThat(reload(referral).getAutoReason()).isEqualTo("self_dealing");
    }

    @Test
    void anAcceptanceOnAListingThatIsNotLiveLeavesTheReferralPending() throws Exception {
        Referral referral = pending(agedReferrer("9866620250"), "9866620251");
        User owner = otherOwner(referral);
        Property listing = verifiedListing(owner);

        for (String sql : new String[] {"update properties set status = 'pending' where id = ?",
                "update properties set status = 'paused' where id = ?",
                "update properties set status = 'approved', archived = true where id = ?"}) {
            jdbc.update(sql, listing.getId());
            entityManager.clear();
            acceptContact(referral, owner, listing);
            assertThat(reload(referral).getStatus()).isEqualTo(ReferralStatuses.PENDING);
        }

        jdbc.update("update properties set status = 'approved', archived = false where id = ?", listing.getId());
        entityManager.clear();
        acceptContact(referral, owner, listing);
        assertThat(reload(referral).getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
    }

    @Test
    void aMissingDeviceIdOnRedeemIsOneRiskSignal() throws Exception {
        User referrer = agedReferrer("9866620260");
        User referee = user("9866620261", "owner");
        assertThat(redeem(referee, mint(referrer, REFERRER_IP, REFERRER_UA, null), IP, UA, null)).isEqualTo(200);
        Referral referral = referrals.findByReferrerId(referrer.getId()).getFirst();

        acceptContact(referral);

        assertThat(reload(referral).getStatus()).isEqualTo(ReferralStatuses.HELD);
    }

    @Test
    void oneOwnerAcceptingASecondRefereeOfTheSameReferrerIsHighRisk() throws Exception {
        User referrer = agedReferrer("9866620270");
        Referral first = pending(referrer, "9866620271");
        Referral second = pending(referrer, "9866620272");
        User owner = otherOwner(first);
        Property listing = verifiedListing(owner);

        acceptContact(first, owner, listing);
        acceptContact(second, owner, listing);

        assertThat(reload(first).getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
        Referral after = reload(second);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.REJECTED);
        assertThat(after.getAutoReason()).isEqualTo("high_risk");
    }

    /** A held seeker row whose hold has elapsed; the contacted listing is another owner's. */
    private Referral dueHeldSeeker(User referrer, String refereeMobile) throws Exception {
        User referee = user(refereeMobile, "owner");
        assertThat(redeem(referee, mint(referrer, REFERRER_IP, REFERRER_UA, null), IP, UA, null)).isEqualTo(200);
        Referral held = referrals.findByReferrerId(referrer.getId()).getFirst();
        acceptContact(held);
        assertThat(reload(held).getStatus()).isEqualTo(ReferralStatuses.HELD);
        jdbc.update("update referrals set hold_until = now() - interval '1 minute' where id = ?", held.getId());
        entityManager.clear();
        return held;
    }

    private UUID contactedListing(Referral referral) {
        return jdbc.queryForObject("select qualified_property_id from referrals where id = ?", UUID.class,
                referral.getId());
    }

    @Test
    void aHeldSeekerReferralIsStillReleasedWhenTheContactedListingWasPausedRentedOrSold() throws Exception {
        String[] mobiles = {"9866620280", "9866620282", "9866620284"};
        String[] changes = {"status = 'paused'", "status = 'rented'", "status = 'sold'"};
        for (int i = 0; i < changes.length; i++) {
            Referral held = dueHeldSeeker(agedReferrer(mobiles[i]), "98666202" + (90 + i));
            jdbc.update("update properties set " + changes[i] + " where id = ?", contactedListing(held));
            entityManager.clear();

            holds.release(held.getId(), Instant.now());

            assertThat(reload(held).getStatus()).as(changes[i]).isEqualTo(ReferralStatuses.QUALIFIED);
        }
    }

    @Test
    void aHeldSeekerReferralIsRejectedWhenTheContactedListingWasRejectedOrFlaggedMeanwhile() throws Exception {
        String[] statuses = {"rejected", "flagged"};
        for (int i = 0; i < statuses.length; i++) {
            Referral held = dueHeldSeeker(agedReferrer("98666203" + (i * 2) + "0"), "98666203" + (i * 2) + "1");
            jdbc.update("update properties set status = ? where id = ?", statuses[i], contactedListing(held));
            entityManager.clear();

            holds.release(held.getId(), Instant.now());

            Referral after = reload(held);
            assertThat(after.getStatus()).as(statuses[i]).isEqualTo(ReferralStatuses.REJECTED);
            assertThat(after.getAutoReason()).isEqualTo("listing_taken_down");
        }
    }

    @Test
    void aHeldSeekerReferralIsRejectedWhenTheContactedListingNowBelongsToTheReferrer() throws Exception {
        User referrer = agedReferrer("9866620320");
        Referral held = dueHeldSeeker(referrer, "9866620321");
        jdbc.update("update properties set owner_id = ? where id = ?", referrer.getId(), contactedListing(held));
        entityManager.clear();

        holds.release(held.getId(), Instant.now());

        Referral after = reload(held);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.REJECTED);
        assertThat(after.getAutoReason()).isEqualTo("self_dealing");
    }

    // ---- a third party's listing is not the referee's ----

    @Test
    void archivingOrRevokingTheContactedListingLeavesAQualifiedSeekerRowAlone() throws Exception {
        Referral referral = pending(agedReferrer("9866620340"), "9866620341");
        acceptContact(referral);
        assertThat(reload(referral).getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
        UUID listing = contactedListing(referral);
        jdbc.update("update properties set archived = true, ownership_verified = false, "
                + "ownership_verified_at = null where id = ?", listing);
        entityManager.clear();

        triggers.listingTakenDown(listing);
        triggers.ownershipRevoked(listing);
        clawbacks.recheck(referral.getId());

        assertThat(reload(referral).getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
    }

    @Test
    void aModerationRejectionOfTheContactedListingClawsASeekerRowBackThroughTheHook() throws Exception {
        Referral referral = pending(agedReferrer("9866620350"), "9866620351");
        acceptContact(referral);
        UUID listing = contactedListing(referral);
        jdbc.update("update properties set status = 'rejected' where id = ?", listing);
        entityManager.clear();

        triggers.listingTakenDown(listing);

        Referral after = reload(referral);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.CLAWED_BACK);
        assertThat(after.getAutoReason()).isEqualTo("listing_taken_down");
    }

    // ---- staff overrides survive the sweep ----

    @Test
    void aStaffApprovedAppealIsNotUndoneByTheHourlyRecheck() throws Exception {
        Referral held = dueHeldSeeker(agedReferrer("9866620360"), "9866620361");
        User staff = user("9866620369", "staff");
        mvc.perform(post("/referrals/" + held.getId() + "/approve").header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk());
        jdbc.update("update users set status = 'suspended' where mobile = ?", held.getReferredMobile());
        entityManager.clear();

        clawbacks.recheck(held.getId());

        Referral after = reload(held);
        assertThat(after.getStatus()).isNotEqualTo(ReferralStatuses.CLAWED_BACK);
        assertThat(after.getHandledBy()).isNotEqualTo(ReferralStatuses.SYSTEM);
    }

    // ---- the referrer is serialised ----

    @Test
    void qualifyingTakesTheReferrersAdvisoryLockUntilCommit() throws Exception {
        Referral referral = pending(agedReferrer("9866620370"), "9866620371");

        acceptContact(referral);

        assertThat(jdbc.queryForObject("""
                select count(*) from pg_locks
                where locktype = 'advisory' and classid = 10 and pid = pg_backend_pid()
                """, Long.class)).isEqualTo(1L);
    }

    // ---- risk bands ----

    @Test
    void oneSignalHoldsTheReferralForTheConfiguredDays() throws Exception {
        Referral referral = pending(user("9866620030", "owner"), "9866620031");

        Referral after = qualifyByListing(referral);

        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.HELD);
        assertThat(after.getHoldUntil()).isBetween(
                Instant.now().plus(6, ChronoUnit.DAYS), Instant.now().plus(8, ChronoUnit.DAYS));
        assertThat(after.getHandledBy()).isEqualTo(ReferralStatuses.SYSTEM);
        assertThat(auditRows(after, "referral.auto.held")).isEqualTo(1);
    }

    @Test
    void twoSignalsRejectTheReferralAndTellTheReferrer() throws Exception {
        User referrer = agedReferrer("9866620040");
        User referee = user("9866620041", "owner");
        assertThat(redeem(referee, mint(referrer, IP, UA, null), IP, UA, null)).isEqualTo(200);
        Referral referral = referrals.findByReferrerId(referrer.getId()).getFirst();

        Referral after = qualifyByListing(referral);

        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.REJECTED);
        assertThat(after.getAutoReason()).isEqualTo("high_risk");
        assertThat(after.getHandledBy()).isEqualTo(ReferralStatuses.SYSTEM);
        assertThat(auditRows(after, "referral.auto.rejected")).isEqualTo(1);
        assertThat(jdbc.queryForList("select body from notifications where user_id = ? and type = 'referral.outcome'",
                String.class, referrer.getId())).singleElement().asString().containsIgnoringCase("contact support");
    }

    @Test
    void aSuccessfulReferralWithNoSignalsIsGrantedAtOnce() throws Exception {
        Referral after = qualifyByListing(pending(agedReferrer("9866620050"), "9866620051"));

        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
        assertThat(auditRows(after, "referral.auto.qualified")).isEqualTo(1);
    }

    // ---- hold release ----

    private Referral heldAndDue(String referrerMobile, String refereeMobile) throws Exception {
        Referral held = qualifyByListing(pending(user(referrerMobile, "owner"), refereeMobile));
        assertThat(held.getStatus()).isEqualTo(ReferralStatuses.HELD);
        jdbc.update("update referrals set hold_until = now() - interval '1 minute' where id = ?", held.getId());
        entityManager.clear();
        return held;
    }

    @Test
    void aHeldReferralIsReleasedOnceTheHoldElapsesWithNoProblem() throws Exception {
        Referral held = heldAndDue("9866620060", "9866620061");

        holds.release(held.getId(), Instant.now());

        Referral after = reload(held);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
        assertThat(after.getGrantedAt()).isNotNull();
        assertThat(auditRows(after, "referral.auto.released")).isEqualTo(1);
    }

    @Test
    void aHeldReferralIsRejectedWhenTheRefereeWasSuspendedMeanwhile() throws Exception {
        Referral held = heldAndDue("9866620070", "9866620071");
        jdbc.update("update users set status = 'suspended' where mobile = ?", held.getReferredMobile());
        entityManager.clear();

        holds.release(held.getId(), Instant.now());

        Referral after = reload(held);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.REJECTED);
        assertThat(after.getAutoReason()).isEqualTo("referee_suspended");
    }

    @Test
    void aHeldReferralStaysHeldUntilItsHoldElapses() throws Exception {
        Referral held = qualifyByListing(pending(user("9866620080", "owner"), "9866620081"));

        holds.release(held.getId(), Instant.now());

        assertThat(reload(held).getStatus()).isEqualTo(ReferralStatuses.HELD);
    }

    @Test
    void theStaffQueueShowsHeldRowsWithTheirHoldAndReason() throws Exception {
        qualifyByListing(pending(user("9866620090", "owner"), "9866620091"));
        User staff = user("9866620099", "staff");

        String body = mvc.perform(get(Routes.Referrals.BASE).header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).contains("\"status\":\"held\"").contains("\"holdUntil\":\"").contains("\"track\":\"owner\"");
    }

    // ---- caps ----

    @Test
    void thePastTheYearlyCapReferralIsRejectedWithNoDeferral() throws Exception {
        setFee("referralQualifyPerYear", 1);
        User referrer = agedReferrer("9866620100");
        Referral first = pending(referrer, "9866620101");
        Referral second = pending(referrer, "9866620102");

        qualifyByListing(first);
        Referral after = qualifyByListing(second);

        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.REJECTED);
        assertThat(after.getAutoReason()).isEqualTo("cap_reached");
    }

    // ---- clawback ----

    private Referral grantedWithListing(String referrerMobile, String refereeMobile, Property[] listing)
            throws Exception {
        Referral referral = pending(agedReferrer(referrerMobile), refereeMobile);
        User referee = users.findByMobile(refereeMobile).orElseThrow();
        listing[0] = verifiedListing(referee);
        qualification.announceOwnershipVerified(referee.getId(), listing[0].getId(), Instant.now());
        Referral granted = reload(referral);
        assertThat(granted.getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
        return granted;
    }

    @Test
    void takingTheQualifyingListingDownClawsTheRewardBack() throws Exception {
        Property[] listing = new Property[1];
        Referral granted = grantedWithListing("9866620110", "9866620111", listing);

        triggers.listingTakenDown(listing[0].getId());

        Referral after = reload(granted);
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.CLAWED_BACK);
        assertThat(after.getAutoReason()).isEqualTo("listing_taken_down");
        assertThat(auditRows(after, "referral.auto.clawback")).isEqualTo(1);
    }

    @Test
    void revokingTheOwnershipVerificationClawsTheRewardBack() throws Exception {
        Property[] listing = new Property[1];
        Referral granted = grantedWithListing("9866620120", "9866620121", listing);

        triggers.ownershipRevoked(listing[0].getId());

        assertThat(reload(granted).getAutoReason()).isEqualTo("verification_revoked");
        assertThat(reload(granted).getStatus()).isEqualTo(ReferralStatuses.CLAWED_BACK);
    }

    @Test
    void suspendingTheRefereeClawsTheRewardBack() throws Exception {
        Property[] listing = new Property[1];
        Referral granted = grantedWithListing("9866620130", "9866620131", listing);

        triggers.refereeSuspended(idOf(granted));

        assertThat(reload(granted).getAutoReason()).isEqualTo("referee_suspended");
        assertThat(reload(granted).getStatus()).isEqualTo(ReferralStatuses.CLAWED_BACK);
    }

    @Test
    void aTriggerAfterTheClawbackWindowLeavesTheRewardAlone() throws Exception {
        Property[] listing = new Property[1];
        Referral granted = grantedWithListing("9866620140", "9866620141", listing);
        jdbc.update("update referrals set granted_at = now() - interval '40 days' where id = ?", granted.getId());
        entityManager.clear();

        triggers.refereeSuspended(idOf(granted));
        clawbacks.recheck(granted.getId());

        assertThat(reload(granted).getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
    }

    @Test
    void theBackstopRecheckClawsBackWhenAnEditDroppedTheVerificationSilently() throws Exception {
        Property[] listing = new Property[1];
        Referral granted = grantedWithListing("9866620150", "9866620151", listing);
        jdbc.update("update properties set ownership_verified = false, ownership_verified_at = null where id = ?",
                listing[0].getId());
        entityManager.clear();

        clawbacks.recheck(granted.getId());

        assertThat(reload(granted).getAutoReason()).isEqualTo("verification_revoked");
    }

    // ---- redeem hardening ----

    @Test
    void aReferralCannotBeRedeemedOutsideTheSignupWindow() throws Exception {
        User referrer = agedReferrer("9866620160");
        User late = user("9866620161", "owner");
        jdbc.update("update users set created_at = now() - interval '48 hours' where id = ?", late.getId());
        entityManager.clear();

        assertThat(redeem(late, mint(referrer, REFERRER_IP, REFERRER_UA, null), IP, UA, null)).isEqualTo(409);
        assertThat(referrals.findByReferrerId(referrer.getId())).isEmpty();
    }

    @Test
    void aReferralCannotBeRedeemedByAnAccountThatAlreadyListed() throws Exception {
        User referrer = agedReferrer("9866620170");
        User lister = user("9866620171", "owner");
        jdbc.update("update users set listings_count = 1 where id = ?", lister.getId());
        entityManager.clear();

        assertThat(redeem(lister, mint(referrer, REFERRER_IP, REFERRER_UA, null), IP, UA, null)).isEqualTo(409);
    }

    @Test
    void aReferralCannotBeRedeemedByAnAccountThatAlreadyAskedForAContact() throws Exception {
        User referrer = agedReferrer("9866620180");
        User asker = user("9866620181", "buyer");
        User owner = user("9866620182", "owner");
        Property listing = verifiedListing(owner);
        mvc.perform(post(Routes.Contacts.REQUEST)
                .header(HttpHeaders.AUTHORIZATION, bearer(asker))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"propertyId\":\"" + listing.getId() + "\"}")).andReturn();

        assertThat(redeem(asker, mint(referrer, REFERRER_IP, REFERRER_UA, null), IP, UA, null)).isEqualTo(409);
    }

    @Test
    void theReferrersOwnDeviceIdIsRefusedAndAnotherIsStoredOnlyAsADigest() throws Exception {
        User referrer = agedReferrer("9866620190");
        String code = mint(referrer, REFERRER_IP, REFERRER_UA, "device-A");
        User same = user("9866620191", "owner");
        User other = user("9866620192", "owner");

        assertThat(redeem(same, code, IP, UA, "device-A")).isEqualTo(409);
        assertThat(redeem(other, code, IP, UA, "device-B")).isEqualTo(200);

        assertThat(jdbc.queryForObject("select referred_device_id_hash from referrals where referred_mobile = ?",
                String.class, "9866620192")).matches("[0-9a-f]{64}");
        assertThat(jdbc.queryForObject("select referrer_device_id_hash from referral_codes where user_id = ?",
                String.class, referrer.getId())).matches("[0-9a-f]{64}");
    }

    @Test
    void anOverlongDeviceIdIsIgnoredRatherThanStored() throws Exception {
        User referrer = agedReferrer("9866620200");
        String code = mint(referrer, REFERRER_IP, REFERRER_UA, null);
        User referee = user("9866620201", "owner");

        assertThat(redeem(referee, code, IP, UA, "x".repeat(65))).isEqualTo(200);

        assertThat(jdbc.queryForObject("select referred_device_id_hash from referrals where referred_mobile = ?",
                String.class, "9866620201")).isNull();
    }

    @Test
    void everyReadOfTheReferrersPageRefreshesTheirDigests() throws Exception {
        User referrer = agedReferrer("9866620210");
        mint(referrer, "198.51.100.20", REFERRER_UA, "device-1");
        String first = digest("referrer_ip_hash", referrer);
        String firstDevice = digest("referrer_device_id_hash", referrer);

        mint(referrer, "198.51.100.21", REFERRER_UA, "device-2");

        assertThat(digest("referrer_ip_hash", referrer)).isNotEqualTo(first);
        assertThat(digest("referrer_device_id_hash", referrer)).isNotEqualTo(firstDevice);
    }

    private String digest(String column, User referrer) {
        entityManager.flush();
        return jdbc.queryForObject("select " + column + " from referral_codes where user_id = ?",
                String.class, referrer.getId());
    }

    // ---- the flag ----

    private void flag(boolean on) {
        jdbc.update("update settings set value = jsonb_set(value, '{referralRewards}', ?::jsonb) where key = 'flags'",
                String.valueOf(on));
        entityManager.clear();
    }

    @Test
    void withTheFlagOffRedeemRefusesAndNothingIsGranted() throws Exception {
        User referrer = agedReferrer("9866620220");
        Referral redeemedBefore = pending(referrer, "9866620221");
        String code = mint(referrer, REFERRER_IP, REFERRER_UA, null);
        User blocked = user("9866620222", "owner");

        flag(false);
        assertThat(redeem(blocked, code, IP, UA, null)).isEqualTo(409);
        assertThat(qualifyByListing(redeemedBefore).getStatus()).isEqualTo(ReferralStatuses.PENDING);

        flag(true);
        assertThat(qualifyByListing(redeemedBefore).getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
    }

    // ---- the summary ----

    @Test
    void theReferrersSummaryCountsHeldAndEarnedByTrack() throws Exception {
        User referrer = agedReferrer("9866620230");
        Referral owner = pending(referrer, "9866620231");
        Referral seeker = pending(referrer, "9866620232");
        qualifyByListing(owner);
        acceptContact(seeker);

        String body = mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andReturn().getResponse().getContentAsString();

        assertThat(body).contains("\"invited\":2").contains("\"converted\":2")
                .contains("\"owner\":{\"referrals\":1,\"agreements\":1}")
                .contains("\"seeker\":{\"referrals\":1,\"contacts\":15}");
    }
}
