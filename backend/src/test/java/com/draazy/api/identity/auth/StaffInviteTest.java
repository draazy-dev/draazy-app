package com.draazy.api.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("D206 — back-office accounts are activated by their holder, not by their creator")
class StaffInviteTest extends AbstractApiTest {
    private static final String MAKERS_CHOICE = "Maker-chose-this!";

    private static final String HOLDERS_CHOICE = "Holder-chose-this!";

    private static final String SECRET = "chosen-by-the-test";

    @Autowired
    UserRepository users;

    @PersistenceContext
    EntityManager em;

    @AfterEach
    void clearCommittedAuditRows() {
        jdbc.update("DELETE FROM audit_log WHERE action LIKE 'user.staff.%'");
    }

    private User admin(String mobile, String email) {
        User user = new User(mobile, Roles.Wire.ADMIN);
        user.setName("Invite probe " + mobile);
        user.setEmail(email);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    private String createStaffAs(User actor, String mobile, String email, String role)
            throws Exception {
        String team = Roles.Wire.STAFF.equals(role) ? ",\"team\":\"" + Teams.RENTAL + "\"" : "";
        String body = mvc.perform(post(Routes.Users.STAFF)
                        .header(HttpHeaders.AUTHORIZATION, bearer(actor))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Minted","mobile":"%s","email":"%s","role":"%s"%s,
                                 "password":"%s"}"""
                                .formatted(mobile, email, role, team, MAKERS_CHOICE)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return body.replaceAll("(?s).*\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String plantToken(String userId) {
        em.flush();
        String inviteId = jdbc.queryForObject(
                "SELECT id::text FROM staff_invites WHERE user_id = ?::uuid", String.class, userId);
        jdbc.update("UPDATE staff_invites SET token_hash = ? WHERE id = ?::uuid",
                sha256Hex(SECRET), inviteId);
        em.clear();
        return inviteId + "." + SECRET;
    }

    private int redeem(String token, String password) throws Exception {
        return mvc.perform(post(Routes.Auth.STAFF_INVITE_REDEEM)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"%s\",\"password\":\"%s\"}".formatted(token, password)))
                .andReturn().getResponse().getStatus();
    }

    private int staffLogin(String email, String password) throws Exception {
        return mvc.perform(post(Routes.Auth.STAFF_LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
                .andReturn().getResponse().getStatus();
    }

    private int otpLogin(String mobile) throws Exception {
        mvc.perform(post(Routes.Auth.LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"%s\"}".formatted(mobile)))
                .andExpect(status().isOk());
        em.flush();
        jdbc.update("""
                UPDATE otp_codes SET code_hash = ?
                WHERE id = (SELECT id FROM otp_codes WHERE mobile = ?
                            ORDER BY created_at DESC LIMIT 1)""",
                sha256Hex("424242"), mobile);
        em.clear();
        return mvc.perform(post(Routes.Auth.LOGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"%s\",\"otp\":\"424242\"}".formatted(mobile)))
                .andReturn().getResponse().getStatus();
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append("%02x".formatted(b));
            }
            return hex.toString();
        } catch (Exception impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    @Test
    @DisplayName("the creator cannot sign in as the colleague before invite redemption")
    void theCreatorCannotSignInAsTheColleagueBeforeRedemption() throws Exception {
        User maker = admin("9866041001", "maker@example.com");

        String hireId = createStaffAs(maker, "9866041003", "hire@example.com", Roles.Wire.STAFF);

        assertThat(staffLogin("hire@example.com", MAKERS_CHOICE)).isEqualTo(401);
        em.flush();
        assertThat(jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?::uuid",
                String.class, hireId))
                .as("a back-office account must be created with no usable credential")
                .isNull();

        String token = plantToken(hireId);
        assertThat(redeem(token, HOLDERS_CHOICE)).isEqualTo(204);
        assertThat(staffLogin("hire@example.com", HOLDERS_CHOICE)).isEqualTo(200);
        assertThat(staffLogin("hire@example.com", MAKERS_CHOICE)).isEqualTo(401);
    }

    @Test
    @DisplayName("an un-activated account cannot sign in by OTP either")
    void anUnactivatedAccountCannotSignInByOtp() throws Exception {
        User maker = admin("9866041010", "maker2@example.com");
        String mobile = "9866041012";
        String hireId = createStaffAs(maker, mobile, "otp-hire@example.com", Roles.Wire.STAFF);

        assertThat(otpLogin(mobile)).isEqualTo(403);
    }

    @Test
    @DisplayName("an invite is single-use — a second redemption is refused and changes nothing")
    void anInviteIsSingleUse() throws Exception {
        User maker = admin("9866041030", "maker4@example.com");
        String hireId = createStaffAs(maker, "9866041032", "once@example.com", Roles.Wire.STAFF);

        String token = plantToken(hireId);
        assertThat(redeem(token, HOLDERS_CHOICE)).isEqualTo(204);
        assertThat(redeem(token, "Attackers-choice!")).isEqualTo(401);

        assertThat(staffLogin("once@example.com", HOLDERS_CHOICE)).isEqualTo(200);
        assertThat(staffLogin("once@example.com", "Attackers-choice!")).isEqualTo(401);
    }

    @Test
    @DisplayName("an expired invite is refused")
    void anExpiredInviteIsRefused() throws Exception {
        User maker = admin("9866041040", "maker5@example.com");
        String hireId = createStaffAs(maker, "9866041042", "stale@example.com", Roles.Wire.STAFF);

        String token = plantToken(hireId);
        jdbc.update("UPDATE staff_invites SET created_at = now() - interval '30 days',"
                + " expires_at = now() - interval '1 second' WHERE user_id = ?::uuid", hireId);

        assertThat(redeem(token, HOLDERS_CHOICE)).isEqualTo(401);
        assertThat(jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?::uuid",
                String.class, hireId)).isNull();
    }

    @Test
    @DisplayName("unknown, wrong and malformed tokens are refused identically")
    void everyRefusalLooksTheSame() throws Exception {
        User maker = admin("9866041050", "maker6@example.com");
        String hireId = createStaffAs(maker, "9866041052", "probe@example.com", Roles.Wire.STAFF);
        String valid = plantToken(hireId);
        String selector = valid.substring(0, valid.indexOf('.'));

        String wrongSecret = body(selector + ".not-the-secret");
        String unknownSelector = body("11111111-1111-1111-1111-111111111111.whatever");
        String notAUuid = body("definitely-not-a-uuid.whatever");
        String noSeparator = body("nosecrethere");

        assertThat(wrongSecret).isEqualTo(unknownSelector)
                .isEqualTo(notAUuid).isEqualTo(noSeparator);
        assertThat(wrongSecret).contains("401");
    }

    private String body(String token) throws Exception {
        var response = mvc.perform(post(Routes.Auth.STAFF_INVITE_REDEEM)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"%s\",\"password\":\"%s\"}"
                                .formatted(token, HOLDERS_CHOICE)))
                .andReturn().getResponse();
        String json = response.getContentAsString();
        return response.getStatus()
                + " " + field(json, "error")
                + " " + field(json, "message");
    }

    private static String field(String json, String name) {
        return json.replaceAll("(?s).*\"" + name + "\"\\s*:\\s*\"([^\"]*)\".*", "$1");
    }

    @Test
    @DisplayName("only a digest of the invite secret is persisted")
    void onlyADigestIsPersisted() throws Exception {
        User maker = admin("9866041060", "maker7@example.com");
        String hireId = createStaffAs(maker, "9866041062", "digest@example.com", Roles.Wire.STAFF);

        em.flush();
        assertThat(jdbc.queryForObject("SELECT token_hash FROM staff_invites WHERE user_id = ?::uuid",
                String.class, hireId))
                .as("a raw token in this column would be replayable straight out of a backup")
                .matches("^[0-9a-f]{64}$");
    }

    @Test
    @DisplayName("a too-short password is refused with a validation error")
    void aTooShortPasswordIsRefused() throws Exception {
        User maker = admin("9866041070", "maker8@example.com");
        String hireId = createStaffAs(maker, "9866041072", "short@example.com", Roles.Wire.STAFF);

        assertThat(redeem(plantToken(hireId), "short")).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?::uuid",
                String.class, hireId)).isNull();
    }

    @Test
    @DisplayName("a password within 72 characters but past BCrypt's 72 bytes is refused, not a 500")
    void aPasswordPastBcryptBytesIsRefused() throws Exception {
        User maker = admin("9866041073", "maker9@example.com");
        String hireId = createStaffAs(maker, "9866041074", "bytes@example.com", Roles.Wire.STAFF);

        assertThat(redeem(plantToken(hireId), "पासवर्ड".repeat(5))).isEqualTo(422);
        assertThat(jdbc.queryForObject("SELECT password_hash FROM users WHERE id = ?::uuid",
                String.class, hireId)).isNull();
    }

    @Test
    @DisplayName("staff creation issues an invite")
    void staffCreationIssuesAnInvite() throws Exception {
        jdbc.update("UPDATE users SET role = 'buyer' WHERE role = 'admin'");
        User solo = admin("9866041080", "solo@example.com");
        String mobile = "9866041082";

        String hireId = createStaffAs(solo, mobile, "bootstrap@example.com", Roles.Wire.STAFF);

        em.flush();
        assertThat(otpLogin(mobile)).isEqualTo(403);

        assertThat(redeem(plantToken(hireId), HOLDERS_CHOICE)).isEqualTo(204);
        assertThat(staffLogin("bootstrap@example.com", HOLDERS_CHOICE)).isEqualTo(200);
    }

    @Test
    @DisplayName("the database refuses an invite that expires before it was issued")
    void theDatabaseRefusesAnImpossibleExpiry() {
        String definition = jdbc.queryForObject(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = ?",
                String.class, "staff_invites_expires_after_issue");

        assertThat(definition.replace(" ", "")).contains("expires_at>created_at");
    }
}
