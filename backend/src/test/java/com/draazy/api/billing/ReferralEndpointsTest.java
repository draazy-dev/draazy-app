package com.draazy.api.billing;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.referral.ReferralRepository;
import com.draazy.api.billing.referral.ReferralStatuses;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.JwtService;
import com.draazy.api.security.Roles;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

/** A referral scheme is an endpoint that pays strangers: redeeming grants nothing, every refusal is
 *  identical so codes cannot be probed, the desk is staff-only and shows both mobiles in full. */
class ReferralEndpointsTest extends AbstractApiTest {

    @Autowired MockMvc mvc;
    @Autowired JwtService jwtService;
    @Autowired UserRepository users;
    @Autowired ReferralRepository referrals;

    // ---- fixtures ----

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Referral User " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private static String jsonField(String body, String field) {
        int i = body.indexOf("\"" + field + "\":\"") + field.length() + 4;
        return body.substring(i, body.indexOf('"', i));
    }

    /** Minted from a fixed non-loopback address: MockMvc gives every request the same remote
     *  address, so otherwise every referral here would come back flagged for correlation. */
    private String codeOf(User u) throws Exception {
        return jsonField(mvc.perform(get(Routes.Referrals.MINE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .with(request -> {
                            request.setRemoteAddr("198.51.100.9");
                            return request;
                        }))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "code");
    }

    private void redeem(User caller, String code, int expectedStatus) throws Exception {
        mvc.perform(post(Routes.Referrals.REDEEM)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"" + code + "\"}"))
                .andExpect(status().is(expectedStatus));
    }

    /** One redeemed referral, returning the referrer and the referral's id. */
    private String referralFrom(User referrer, User referred) throws Exception {
        redeem(referred, codeOf(referrer), 200);
        return referrals.findByReferrerId(referrer.getId()).getFirst().getId().toString();
    }

    // ---- 1: the code ----

    @Test
    void theCodeIsMintedOnceAndNeverChanges() throws Exception {
        User u = user("9866600001", "owner");

        String first = codeOf(u);
        assertThat(first).startsWith("PUNE-").hasSize(9);
        // Deliberately excluded from the alphabet: these are the characters people misread aloud.
        assertThat(first.substring(5)).doesNotContainAnyWhitespaces()
                .matches("[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}");
        assertThat(codeOf(u)).isEqualTo(first);
    }

    @Test
    void anUntouchedSchemeReportsNothingEarnedAndNothingPending() throws Exception {
        User u = user("9866600002", "owner");
        mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(u)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invited").value(0))
                .andExpect(jsonPath("$.converted").value(0))
                .andExpect(jsonPath("$.held").value(0))
                .andExpect(jsonPath("$.earned.owner.referrals").value(0))
                .andExpect(jsonPath("$.earned.owner.agreements").value(0))
                .andExpect(jsonPath("$.earned.seeker.referrals").value(0))
                .andExpect(jsonPath("$.earned.seeker.contacts").value(0))
                .andExpect(jsonPath("$.friendReward.redeemed").value(false))
                .andExpect(jsonPath("$.contactsEarned").doesNotExist())
                .andExpect(jsonPath("$.contactsPending").doesNotExist());
    }

    // ---- 2: redeeming ----

    @Test
    void redeemingCountsAsInvitedAndPendingButNotYetEarned() throws Exception {
        User referrer = user("9866600010", "owner");
        User referred = user("9866600011", "buyer");

        redeem(referred, codeOf(referrer), 200);

        mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.invited").value(1))
                .andExpect(jsonPath("$.converted").value(0));
    }

    @Test
    void theRedeemerSeesTheirFriendRewardPromise() throws Exception {
        User referrer = user("9866600012", "owner");
        User referred = user("9866600013", "buyer");

        redeem(referred, codeOf(referrer), 200);

        mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(referred)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.friendReward.redeemed").value(true))
                .andExpect(jsonPath("$.friendReward.status").value(ReferralStatuses.PENDING))
                .andExpect(jsonPath("$.friendReward.contacts").value(5))
                .andExpect(jsonPath("$.friendReward.featuredDays").value(14));
    }

    @Test
    void everyRefusalLooksTheSame() throws Exception {
        User referrer = user("9866600020", "owner");
        User referred = user("9866600021", "buyer");
        String code = codeOf(referrer);

        // A code nobody holds.
        redeem(referred, "PUNE-ZZZZ", 409);
        // Your own.
        redeem(referrer, code, 409);
        // A mobile that has already been referred.
        redeem(referred, code, 200);
        redeem(referred, code, 409);

        assertThat(referrals.findByReferrerId(referrer.getId())).hasSize(1);
    }

    @Test
    void redeemingRequiresACaller() throws Exception {
        mvc.perform(post(Routes.Referrals.REDEEM)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"code\":\"PUNE-ABCD\"}"))
                .andExpect(status().isUnauthorized());
    }

    // ---- 3: the fraud desk ----

    @ParameterizedTest(name = "{0} is refused the queue and every decision")
    @ValueSource(strings = {"a plain caller", "staff without reports.write"})
    void theQueueAndItsDecisionsAreStaffOnly(String caller) throws Exception {
        User referrer = user("9866600030", "owner");
        User referred = user("9866600031", "buyer");
        String id = referralFrom(referrer, referred);
        String refused = caller.equals("a plain caller")
                ? bearer(referred)
                : staffWithFunctions("9866600034", "[]");

        mvc.perform(get(Routes.Referrals.BASE).header(HttpHeaders.AUTHORIZATION, refused))
                .andExpect(status().isForbidden());
        mvc.perform(post("/referrals/" + id + "/approve").header(HttpHeaders.AUTHORIZATION, refused))
                .andExpect(status().isForbidden());
        mvc.perform(post("/referrals/" + id + "/reject").header(HttpHeaders.AUTHORIZATION, refused))
                .andExpect(status().isForbidden());
        mvc.perform(post("/referrals/" + id + "/clawback").header(HttpHeaders.AUTHORIZATION, refused))
                .andExpect(status().isForbidden());
    }

    @Test
    void theQueueIsPagedAndShowsBothMobiles() throws Exception {
        User referrer = user("9866600040", "owner");
        User referred = user("9866600041", "buyer");
        User staff = user("9866600042", "staff");
        referralFrom(referrer, referred);

        mvc.perform(get(Routes.Referrals.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .param("status", ReferralStatuses.PENDING))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.page").exists())
                .andExpect(jsonPath("$.content[0].status").value(ReferralStatuses.PENDING))
                .andExpect(jsonPath("$.content[0].rewardAmount").value(0))
                .andExpect(jsonPath("$.content[0].track").doesNotExist())
                .andExpect(jsonPath("$.content[0].holdUntil").doesNotExist())
                .andExpect(jsonPath("$.content[0].autoReason").doesNotExist())
                .andExpect(jsonPath("$.content[0].referrerMobile").value(referrer.getMobile()))
                .andExpect(jsonPath("$.content[0].referredMobile").value(referred.getMobile()))
                // False because the fixture redeems from a different address than the code was
                // minted from — see codeOf. False means "no correlation found".
                .andExpect(jsonPath("$.content[0].sameDevice").value(false))
                .andExpect(jsonPath("$.content[0].sameIp").value(false))
                .andExpect(jsonPath("$.counts").doesNotExist())
                .andExpect(jsonPath("$.content[0].handledBy").doesNotExist())
                .andExpect(jsonPath("$.content[0].handledAt").doesNotExist())
                .andExpect(jsonPath("$.content[0].shareChannel").doesNotExist())
                .andExpect(jsonPath("$.content[0].qualifiedAt").doesNotExist());
    }

    @Test
    void theQueueFiltersOnTheServerAndCountsOnRequest() throws Exception {
        User referrer = user("9866600060", "owner");
        User referred = user("9866600061", "buyer");
        User staff = user("9866600062", "staff");
        String id = referralFrom(referrer, referred);

        mvc.perform(get(Routes.Referrals.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .param("status", ReferralStatuses.PENDING + ",qualified")
                        .param("q", referred.getName().toLowerCase())
                        .param("counts", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')]").isNotEmpty())
                .andExpect(jsonPath("$.counts.all").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.counts.pending").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.counts.highRisk").exists())
                .andExpect(jsonPath("$.counts.held").exists())
                .andExpect(jsonPath("$.counts.rewarded").exists())
                .andExpect(jsonPath("$.counts.refused").exists());

        mvc.perform(get(Routes.Referrals.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .param("status", ReferralStatuses.REWARDED)
                        .param("q", referred.getName().toLowerCase()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')]").isEmpty());

        mvc.perform(get(Routes.Referrals.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .param("q", referrer.getMobile()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')]").isNotEmpty());

        mvc.perform(get(Routes.Referrals.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .param("q", "zz-no-such-person"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", org.hamcrest.Matchers.hasSize(0)));
    }

    @Test
    void daysNarrowsTheQueueByWhenTheReferralWasMade() throws Exception {
        User staff = user("9866600092", "staff");
        User oldReferrer = user("9866600093", "owner");
        User oldReferred = user("9866600094", "buyer");
        User newReferrer = user("9866600095", "owner");
        User newReferred = user("9866600096", "buyer");
        String old = referralFrom(oldReferrer, oldReferred);
        String fresh = referralFrom(newReferrer, newReferred);
        Instant midnight = LocalDate.now(PlatformTime.IST).atStartOfDay(PlatformTime.IST).toInstant();
        jdbc.update("update referrals set at = ? where id = ?",
                Timestamp.from(midnight.minus(1, ChronoUnit.MINUTES)), UUID.fromString(old));

        queueIds(staff, newReferrer, "1").contains(fresh);
        queueIds(staff, oldReferrer, "1").doesNotContain(old);
        queueIds(staff, oldReferrer, "7").contains(old);
        queueIds(staff, oldReferrer, null).contains(old);
    }

    private org.assertj.core.api.AbstractStringAssert<?> queueIds(User staff, User referrer, String days) throws Exception {
        var request = get(Routes.Referrals.BASE)
                .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                .param("q", referrer.getMobile());
        if (days != null) {
            request.param("days", days);
        }
        return assertThat(mvc.perform(request).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }
    @Test
    void approvingReleasesTheRewardAndCannotBeDoneTwice() throws Exception {
        User referrer = user("9866600050", "owner");
        User referred = user("9866600051", "buyer");
        User staff = user("9866600052", "staff");
        String id = referralFrom(referrer, referred);

        mvc.perform(post("/referrals/" + id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(ReferralStatuses.REWARDED))
                .andExpect(jsonPath("$.handledAt").doesNotExist());

        mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.converted").value(1));

        mvc.perform(post("/referrals/" + id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isConflict());
    }

    @Test
    void approvingARejectedReferralIsAnAppealThatNeedsAReason() throws Exception {
        User referrer = user("9866600055", "owner");
        User referred = user("9866600056", "buyer");
        User staff = user("9866600057", "staff");
        String id = referralFrom(referrer, referred);
        String auth = bearer(staff);

        mvc.perform(post("/referrals/" + id + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"first look\"}"))
                .andExpect(status().isOk());

        mvc.perform(post("/referrals/" + id + "/approve").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/referrals/" + id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"  \"}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post("/referrals/" + id + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Appeal: separate households\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(ReferralStatuses.REWARDED));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject(
                "select count(*) from audit_log where entity = 'referral' and entity_id = ? "
                        + "and action = 'referral.approve' and metadata::text like '%Appeal: separate households%'",
                Long.class, id)).isEqualTo(1L);
    }

    @Test
    void rejectingRefusesTheRewardAndKeepsTheReason() throws Exception {
        User referrer = user("9866600060", "owner");
        User referred = user("9866600061", "buyer");
        User staff = user("9866600062", "staff");
        String id = referralFrom(referrer, referred);

        mvc.perform(post("/referrals/" + id + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Same household\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(ReferralStatuses.REJECTED));

        mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.converted").value(0));
    }

    @Test
    void onlyAReleasedRewardCanBeClawedBack() throws Exception {
        User referrer = user("9866600070", "owner");
        User referred = user("9866600071", "buyer");
        User staff = user("9866600072", "staff");
        String id = referralFrom(referrer, referred);
        String auth = bearer(staff);

        // Nothing was ever paid, so there is nothing to recover.
        mvc.perform(post("/referrals/" + id + "/clawback")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Fraud ring\"}"))
                .andExpect(status().isConflict());

        mvc.perform(post("/referrals/" + id + "/approve").header(HttpHeaders.AUTHORIZATION, auth))
                .andExpect(status().isOk());

        mvc.perform(post("/referrals/" + id + "/clawback")
                        .header(HttpHeaders.AUTHORIZATION, auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"Fraud ring\"}"))
                .andExpect(status().isOk())
                // Distinct from `rejected` on purpose: this one was paid and taken back.
                .andExpect(jsonPath("$.status").value(ReferralStatuses.CLAWED_BACK));

        mvc.perform(get(Routes.Referrals.MINE).header(HttpHeaders.AUTHORIZATION, bearer(referrer)))
                .andExpect(status().isOk())
                // The grant is derived from the row's status, so the clawback withdrew it with no
                // compensating write.
                .andExpect(jsonPath("$.converted").value(0));
    }

    @Test
    void aReferralThatDoesNotExistIsNotFound() throws Exception {
        User staff = user("9866600080", "staff");
        mvc.perform(post("/referrals/" + java.util.UUID.randomUUID() + "/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isNotFound());
        // A non-UUID path token is a 404 too, not a 400 — Ids.parseUuid returns empty.
        mvc.perform(post("/referrals/not-a-uuid/approve")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isNotFound());
    }

    private String staffWithFunctions(String mobile, String functionsJson) {
        User staff = user(mobile, Roles.Wire.STAFF);
        jdbc.update("INSERT INTO back_office_permissions (user_id, permissions) "
                + "VALUES (?::uuid, ?::jsonb)", staff.getId().toString(), functionsJson);
        return bearer(staff);
    }
}
