package com.draazy.api.billing;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.billing.referral.Referral;
import com.draazy.api.billing.referral.ReferralQualification;
import com.draazy.api.billing.referral.ReferralRepository;
import com.draazy.api.billing.referral.ReferralSignalRetention;
import com.draazy.api.billing.referral.ReferralStatuses;
import com.draazy.api.billing.referral.ShareChannels;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.settings.PlatformSettings;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class ReferralQualificationTest extends AbstractApiTest {
    private static final long SEEDED_CAP = 10L;

    private static final String UA = "DraazyTest/1.0 (referral qualification)";
    private static final String IP = "203.0.113.7";

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired ReferralRepository referrals;
    @Autowired ReferralQualification qualification;
    @Autowired ReferralSignalRetention retention;
    @Autowired PlatformSettings settings;
    @Autowired EntityManager entityManager;

    private void setCap(long cap) {
        jdbc.update("update settings set value = jsonb_set(value, "
                + "'{referralQualifyPerMonth}', ?::jsonb) where key = 'fees'", String.valueOf(cap));
        entityManager.clear();
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Qualification User " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private User referrer(String mobile) {
        User u = user(mobile, "owner");
        jdbc.update("update users set created_at = now() - interval '30 days' where id = ?", u.getId());
        entityManager.clear();
        return u;
    }

    private static String jsonField(String body, String field) {
        int i = body.indexOf("\"" + field + "\":\"") + field.length() + 4;
        return body.substring(i, body.indexOf('"', i));
    }

    private String codeOf(User u, String ip, String userAgent) throws Exception {
        return jsonField(mvc.perform(get(Routes.Referrals.MINE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(u))
                        .header(HttpHeaders.USER_AGENT, userAgent)
                        .with(request -> {
                            request.setRemoteAddr(ip);
                            return request;
                        }))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString(), "code");
    }

    private void redeem(User caller, String code, String shareChannel, String ip, String userAgent)
            throws Exception {
        String body = shareChannel == null
                ? "{\"code\":\"" + code + "\"}"
                : "{\"code\":\"" + code + "\",\"shareChannel\":\"" + shareChannel + "\"}";
        mvc.perform(post(Routes.Referrals.REDEEM)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .header(HttpHeaders.USER_AGENT, userAgent)
                        .header("X-Device-Id", "device-" + caller.getMobile())
                        .with(request -> {
                            request.setRemoteAddr(ip);
                            return request;
                        })
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    private Referral referral(String referrerMobile, String referredMobile) throws Exception {
        User referrer = referrer(referrerMobile);
        User referred = user(referredMobile, "owner");
        redeem(referred, codeOf(referrer, "198.51.100.1", "Referrer/1.0"), null, IP, UA);
        return referrals.findByReferrerId(referrer.getId()).getFirst();
    }

    private Referral reload(UUID id) {
        return referrals.findById(id).orElseThrow();
    }

    private UUID live(UUID ownerId) {
        User owner = users.findById(ownerId).orElseThrow();
        Property p = new Property(owner, "Qualifying flat", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p).getId();
    }

    @Test
    void aVerifiedFirstListingQualifiesTheReferral() throws Exception {
        Referral referral = referral("9866610010", "9866610011");
        assertThat(referral.getStatus()).isEqualTo(ReferralStatuses.PENDING);
        assertThat(referral.getQualifiedAt()).isNull();
        assertThat(referral.isActivated()).isFalse();

        UUID owner = users.findByMobile(referral.getReferredMobile()).orElseThrow().getId();
        UUID property = live(owner);
        Instant verifiedAt = Instant.now().truncatedTo(ChronoUnit.MILLIS);

        qualification.announceOwnershipVerified(owner, property, verifiedAt);

        Referral after = reload(referral.getId());
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.QUALIFIED);
        assertThat(after.getQualifiedPropertyId()).isEqualTo(property);
        assertThat(after.getQualifiedAt()).isNotNull();
        assertThat(after.isActivated()).isTrue();
        assertThat(after.getTrack()).isEqualTo(ReferralStatuses.TRACK_OWNER);
        assertThat(after.getGrantedAt()).isNotNull();
        assertThat(after.getHandledBy()).isEqualTo(ReferralStatuses.SYSTEM);
        assertThat(after.getRewardAmount()).isEqualTo(50L);
    }

    @ParameterizedTest(name = "{0} mints nothing further")
    @CsvSource({
            "a second verified listing, false",
            "re-verifying the same property, true"})
    void aRepeatedVerificationMintsNothingFurther(String announcement, boolean sameProperty)
            throws Exception {
        Referral referral = referral("9866610030", "9866610031");
        UUID owner = users.findByMobile(referral.getReferredMobile()).orElseThrow().getId();
        UUID property = live(owner);

        qualification.announceOwnershipVerified(owner, property, Instant.now());
        Instant firstQualifiedAt = reload(referral.getId()).getQualifiedAt();
        UUID firstProperty = reload(referral.getId()).getQualifiedPropertyId();

        qualification.announceOwnershipVerified(
                owner, sameProperty ? property : live(owner), Instant.now().plusSeconds(60));

        List<Referral> all = referrals.findByReferrerId(referral.getReferrerId());
        assertThat(all).hasSize(1);
        assertThat(all).filteredOn(r -> r.getQualifiedAt() != null).hasSize(1);
        assertThat(all.getFirst().getQualifiedPropertyId()).isEqualTo(firstProperty);
        assertThat(all.getFirst().getQualifiedAt()).isEqualTo(firstQualifiedAt);
    }

    @Test
    void anOwnerWhoWasNeverReferredQualifiesNobody() throws Exception {
        User loner = user("9866610050", "owner");
        long before = referrals.count();

        qualification.announceOwnershipVerified(loner.getId(), UUID.randomUUID(), Instant.now());

        assertThat(referrals.count()).isEqualTo(before);
    }

    @Test
    void anAlreadyRejectedReferralIsNotResurrectedByALaterVerification() throws Exception {
        Referral referral = referral("9866610060", "9866610061");
        User staff = user("9866610062", "staff");
        mvc.perform(post("/referrals/" + referral.getId() + "/reject")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"desk test\"}"))
                .andExpect(status().isOk());

        UUID owner = users.findByMobile(referral.getReferredMobile()).orElseThrow().getId();
        qualification.announceOwnershipVerified(owner, live(owner), Instant.now());

        Referral after = reload(referral.getId());
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.REJECTED);
        assertThat(after.getQualifiedAt()).isNull();
    }

    @Test
    void theCapIsConfigurationAndDefaultsToTenAMonth() {
        assertThat(settings.referralQualifyPerMonth()).isEqualTo(SEEDED_CAP);

        setCap(2);
        assertThat(settings.referralQualifyPerMonth()).isEqualTo(2L);
    }

    @Test
    void pastTheCapTheReferralIsRejectedAutomaticallyWithNoDeferral() throws Exception {
        setCap(1);

        User referrer = referrer("9866610070");
        String code = codeOf(referrer, "198.51.100.2", "Referrer/1.0");

        User flatmateOne = user("9866610071", "owner");
        User flatmateTwo = user("9866610072", "owner");
        redeem(flatmateOne, code, null, IP, UA);
        redeem(flatmateTwo, code, null, IP, UA);

        qualification.announceOwnershipVerified(flatmateOne.getId(), live(flatmateOne.getId()),
                Instant.now());
        qualification.announceOwnershipVerified(flatmateTwo.getId(), live(flatmateTwo.getId()),
                Instant.now());

        List<Referral> all = referrals.findByReferrerId(referrer.getId());
        assertThat(all).hasSize(2);
        assertThat(all).filteredOn(r -> ReferralStatuses.QUALIFIED.equals(r.getStatus())).hasSize(1);
        assertThat(all).filteredOn(r -> ReferralStatuses.REJECTED.equals(r.getStatus()))
                .singleElement()
                .satisfies(r -> {
                    assertThat(r.getAutoReason()).isEqualTo("cap_reached");
                    assertThat(r.getHandledBy()).isEqualTo(ReferralStatuses.SYSTEM);
                });
    }

    @Test
    void qualificationsOutsideTheCalendarMonthDoNotCountAgainstTheCap() throws Exception {
        setCap(1);

        User referrer = referrer("9866610080");
        String code = codeOf(referrer, "198.51.100.3", "Referrer/1.0");
        User longAgo = user("9866610081", "owner");
        User thisMonth = user("9866610082", "owner");
        redeem(longAgo, code, null, IP, UA);
        redeem(thisMonth, code, null, IP, UA);

        qualification.announceOwnershipVerified(longAgo.getId(), live(longAgo.getId()), Instant.now());
        jdbc.update("update referrals set qualified_at = now() - interval '100 days' "
                + "where referred_mobile = ?", longAgo.getMobile());

        qualification.announceOwnershipVerified(thisMonth.getId(), live(thisMonth.getId()),
                Instant.now());

        assertThat(referrals.findByReferrerId(referrer.getId()))
                .filteredOn(r -> ReferralStatuses.QUALIFIED.equals(r.getStatus()))
                .hasSize(2);
    }

    @Test
    void theShareChannelIsRecordedWhenTheClientReportsOne() throws Exception {
        User referrer = referrer("9866610090");
        User referred = user("9866610091", "owner");
        redeem(referred, codeOf(referrer, "198.51.100.4", "Referrer/1.0"),
                ShareChannels.WHATSAPP, IP, UA);

        Referral referral = referrals.findByReferrerId(referrer.getId()).getFirst();
        assertThat(referral.getShareChannel()).isEqualTo(ShareChannels.WHATSAPP);
        assertThat(referral.getChannel()).isEqualTo("seeker");
    }

    @Test
    void anUnknownShareChannelIsDroppedRatherThanFailingTheRedemption() throws Exception {
        User referrer = referrer("9866610100");
        User referred = user("9866610101", "owner");
        redeem(referred, codeOf(referrer, "198.51.100.5", "Referrer/1.0"),
                "carrier-pigeon", IP, UA);

        assertThat(referrals.findByReferrerId(referrer.getId()).getFirst().getShareChannel())
                .isNull();
    }

    @Test
    void everyDeclaredShareChannelIsAcceptedByTheDatabase() {
        Set<String> declared = ShareChannels.all();
        assertThat(declared).isNotEmpty();
        for (String channel : declared) {
            assertThat(jdbc.queryForObject(
                    "select ?::text in ('whatsapp','sms','email','copy','qr','other')",
                    Boolean.class, channel))
                    .as("V64 accepts %s", channel)
                    .isTrue();
        }
    }

    @Test
    void redeemingFromTheReferrersOwnNetworkAndBrowserIsHighRisk() throws Exception {
        User referrer = referrer("9866610110");
        User referred = user("9866610111", "owner");
        String code = codeOf(referrer, IP, UA);
        redeem(referred, code, null, IP, UA);

        Referral referral = referrals.findByReferrerId(referrer.getId()).getFirst();
        assertThat(referral.isSameIp()).isTrue();
        assertThat(referral.isSameDevice()).isTrue();
        assertThat(referral.getStatus()).isEqualTo(ReferralStatuses.PENDING);
        assertThat(referral.getRisk()).isEqualTo("high");
    }

    @Test
    void neitherTheAddressNorTheUserAgentIsEverStored() throws Exception {
        Referral referral = referral("9866610130", "9866610131");

        String ipHash = jdbc.queryForObject(
                "select referred_ip_hash from referrals where id = ?", String.class,
                referral.getId());
        String uaHash = jdbc.queryForObject(
                "select referred_device_hash from referrals where id = ?", String.class,
                referral.getId());

        assertThat(ipHash).isNotNull().matches("[0-9a-f]{64}").isNotEqualTo(IP).doesNotContain(IP);
        assertThat(uaHash).isNotNull().matches("[0-9a-f]{64}").doesNotContain("Draazy");

        String queue = mvc.perform(get(Routes.Referrals.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(user("9866610132", "staff"))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(queue).doesNotContain(ipHash).doesNotContain(uaHash).doesNotContain(IP);
    }

    @Test
    void digestsAreClearedOnceTheyLeaveTheRetentionWindow() throws Exception {
        Referral referral = referral("9866610140", "9866610141");
        UUID referrerId = referral.getReferrerId();

        int clearedWhileFresh = retention.expireSignalsOlderThan(Instant.now().minus(
                java.time.Duration.ofDays(settings.referralSignalRetentionDays())));
        assertThat(clearedWhileFresh).isZero();
        assertThat(jdbc.queryForObject("select referred_ip_hash from referrals where id = ?",
                String.class, referral.getId())).isNotNull();

        retention.expireSignalsOlderThan(Instant.now().plusSeconds(1));

        assertThat(jdbc.queryForObject("select referred_ip_hash from referrals where id = ?",
                String.class, referral.getId())).isNull();
        assertThat(jdbc.queryForObject("select referred_device_hash from referrals where id = ?",
                String.class, referral.getId())).isNull();
        assertThat(jdbc.queryForObject("select referrer_ip_hash from referral_codes where user_id = ?",
                String.class, referrerId)).isNull();
        assertThat(jdbc.queryForObject("select signals_at from referral_codes where user_id = ?",
                Object.class, referrerId)).isNull();

        Referral after = reload(referral.getId());
        assertThat(after.isSameIp()).isFalse();
        assertThat(after.getStatus()).isEqualTo(ReferralStatuses.PENDING);
    }
}
