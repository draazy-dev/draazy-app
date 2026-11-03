package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Flatmates — owner consent, granted before the group exists")
class FlatmateOwnerConsentEndpointsTest extends AbstractApiTest {
    @Autowired
    UserRepository users;

    @PersistenceContext
    EntityManager em;

    private final List<String> createdActors = new ArrayList<>();
    private final List<String> usedMobiles = new ArrayList<>();

    @AfterEach
    void removeRowsThatEscapedRollback() {
        createdActors.forEach(actor -> {
            jdbc.update("delete from audit_log where actor = ?", actor);
            jdbc.update("delete from flatmate_owner_consents where granted_by = ?::uuid", actor);
        });
        usedMobiles.forEach(m -> jdbc.update("delete from otp_codes where mobile = ?", m));
        createdActors.clear();
        usedMobiles.clear();
    }

    private User user(String mobile, String name) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName(name);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private void sendAndForceCode(User tenant, String ownerMobile) throws Exception {
        sendAndForceCode(tenant, ownerMobile, "Replacement flatmate", "Baner");
        }

        private void sendAndForceCode(User tenant, String ownerMobile, String title, String locality)
            throws Exception {
        usedMobiles.add(ownerMobile);
        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                            {"ownerMobile":"%s","title":"%s",
                             "locality":"%s"}
                            """.formatted(ownerMobile, title, locality)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.consentRecorded").value(false))

                .andExpect(jsonPath("$.resendAfterSeconds").exists());
        em.flush();
        jdbc.update("""
                UPDATE otp_codes SET code_hash = ?
                WHERE id = (SELECT id FROM otp_codes WHERE mobile = ?
                            ORDER BY created_at DESC LIMIT 1)""",
                sha256Hex("424242"), ownerMobile);
        em.clear();
    }

    private void record(User tenant, String ownerMobile, String title, String locality)
            throws Exception {
        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerMobile":"%s","otp":"424242",
                                 "title":"%s","locality":"%s"}
                                """.formatted(ownerMobile, title, locality)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.consentRecorded").value(true))

                .andExpect(jsonPath("$.resendAfterSeconds").doesNotExist());
    }

    private static String sha256Hex(String raw) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16)).append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Test
    @DisplayName("the first call sends a code, the second writes a consent with no group")
    void twoStepFlowWritesAGrouplessRow() throws Exception {
        User tenant = user("9830000401", "Tenant");
        sendAndForceCode(tenant, "9830000402");

        String purpose = jdbc.queryForObject(
                "select purpose from otp_codes where mobile = '9830000402'", String.class);
        assertThat(purpose).startsWith("owner-consent:");

        record(tenant, "9830000402", "Replacement flatmate", "Baner");

        Integer grouplessRows = jdbc.queryForObject("""
                select count(*) from flatmate_owner_consents
                 where owner_mobile = '9830000402' and granted_by = ?::uuid and group_id is null""",
                Integer.class, tenant.getId().toString());
        assertThat(grouplessRows).isEqualTo(1);
    }

    @Test
    @DisplayName("consent granted before the room is created lands on the room")
    void consentIsReadBackAtCreateTime() throws Exception {
        User tenant = user("9830000403", "Tenant");
        sendAndForceCode(tenant, "9830000404", "Consent Towers", "Baner");
        record(tenant, "9830000404", "Consent Towers", "Baner");

        String roomId = createTenantRoom(tenant, "Consent Towers", "9830000404");

        assertThat(roomConsent(roomId)).isTrue();
    }

    @Test
    @DisplayName("claiming consent without having taken it does not grant it")
    void theFlagIsNotClientSettable() throws Exception {
        User tenant = user("9830000405", "Optimist");

        String roomId = createTenantRoom(tenant, "Optimist Towers", "9830000406");

        assertThat(roomConsent(roomId)).isFalse();
    }

    private String createTenantRoom(User tenant, String society, String ownerMobile) throws Exception {
        String json = mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(withSocietyIds("""
                                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                                 "locality":"Baner","society":"%s","rentShare":15000,"deposit":30000,
                                 "availableFrom":"2026-09-01","lookingFor":"any","foodPref":"any",
                                 "hostRole":"tenant","ownerConsent":true,"ownerConsentMobile":"%s",
                                 %s,"note":"Quiet room.",%s,%s}
                                """.formatted(society, ownerMobile, FlatmateRoomFixture.photos(tenant.getId()),
                                FlatmateRoomFixture.BASICS, FlatmateRoomFixture.DETAILS))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(json, "$.id");
    }

    private boolean roomConsent(String roomId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select owner_consent from flatmate_rooms where id = ?::uuid", Boolean.class, roomId));
    }

    @Test
    @DisplayName("a wrong code records nothing")
    void wrongCodeIsRefused() throws Exception {
        User tenant = user("9830000407", "Tenant");
        sendAndForceCode(tenant, "9830000408");

        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"ownerMobile":"9830000408","otp":"000000",
                                 "title":"Replacement flatmate","locality":"Baner"}
                                """))
                .andExpect(status().isUnauthorized());

        Integer rows = jdbc.queryForObject(
                "select count(*) from flatmate_owner_consents where owner_mobile = '9830000408'",
                Integer.class);
        assertThat(rows).isZero();
    }

    @Test
    @DisplayName("a code presented without naming a flat records nothing")
    void consentMustNameTheFlat() throws Exception {
        User tenant = user("9830000411", "Tenant");
        sendAndForceCode(tenant, "9830000412");

        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerMobile\":\"9830000412\",\"otp\":\"424242\"}"))
                .andExpect(status().isBadRequest());

        Integer rows = jdbc.queryForObject(
                "select count(*) from flatmate_owner_consents where owner_mobile = '9830000412'",
                Integer.class);
        assertThat(rows).isZero();
    }

    @Test
    @DisplayName("a send that names no flat costs the owner no SMS")
    void sendMustNameTheFlatToo() throws Exception {
        User tenant = user("9830000415", "Tenant");

        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerMobile\":\"9830000416\"}"))
                .andExpect(status().isBadRequest());

        Integer codes = jdbc.queryForObject(
                "select count(*) from otp_codes where mobile = '9830000416'", Integer.class);
        assertThat(codes).isZero();
    }

    @Test
    @DisplayName("consent granted after the room exists still reaches it")
    void consentTakenLaterReachesThePostItNames() throws Exception {
        User tenant = user("9830000413", "Latecomer");
        String roomId = createTenantRoom(tenant, "Late Towers", "9830000414");
        assertThat(roomConsent(roomId)).isFalse();

        sendAndForceCode(tenant, "9830000414", "Late Towers", "Baner");
        record(tenant, "9830000414", "Late Towers", "Baner");

        assertThat(roomConsent(roomId)).isTrue();
    }

    @Test
    @DisplayName("a tenant cannot consent on their own behalf")
    void selfConsentIsRefused() throws Exception {
        User tenant = user("9830000409", "SelfServer");

        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerMobile\":\"9830000409\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("owner_consent_self"));
    }

    @Test
    @DisplayName("consent cannot be requested anonymously")
    void anonymousIsRefused() throws Exception {
        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ownerMobile\":\"9830000410\"}"))
                .andExpect(status().isUnauthorized());
    }
}
