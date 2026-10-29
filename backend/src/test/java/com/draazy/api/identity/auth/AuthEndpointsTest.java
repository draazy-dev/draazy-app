package com.draazy.api.identity.auth;

import com.draazy.api.support.AbstractApiTest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.draazy.api.common.web.RequestCorrelation;
import com.draazy.api.identity.auth.OtpCaptureConfig.CapturingOtpSender;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.JwtProperties;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.Cookie;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.ConnectionHolder;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Import(OtpCaptureConfig.class)
class AuthEndpointsTest extends AbstractApiTest {
    final ObjectMapper json = new ObjectMapper();
    @Autowired
    UserRepository users;
    @Autowired
    PasswordEncoder passwordEncoder;
    @Autowired
    CapturingOtpSender otp;
    @Autowired
    DataSource dataSource;
    @Autowired
    RefreshCookie cookies;
    @Autowired
    JwtProperties jwt;
    @Autowired
    OtpService otpService;
    @PersistenceContext
    EntityManager em;

    private static DataSource cleanupDataSource;

    @BeforeEach
    void captureDataSourceForCleanup() {
        cleanupDataSource = dataSource;
    }

    // provisionBuyer is REQUIRES_NEW and commits past the class rollback; delete it in @AfterAll,
    // because a committing delete on a second connection would block on row locks.
    @AfterAll
    static void removeAutoProvisionedBuyers() {
        if (cleanupDataSource == null) {
            return;
        }
        new JdbcTemplate(cleanupDataSource).update("delete from users where mobile like '987650%'");
    }

    @Test
    void loginSendStepReturnsOtpSentAndNoTokens() throws Exception {
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"9876500201\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.otpSent").value(true))
                .andExpect(jsonPath("$.accessToken").doesNotExist())
                .andExpect(header().exists(RequestCorrelation.TRACE_ID_HEADER));
    }

    @Test
    void loginVerifyIssuesTokensAndAutoProvisionsBuyer() throws Exception {
        String mobile = "9876500202";
        sendOtp(mobile);

        MvcResult res = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(mobile, otp.lastCode)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").doesNotExist())
                .andExpect(jsonPath("$.tokenType").value("Bearer"))
                .andExpect(jsonPath("$.expiresIn").value(900))
                .andExpect(jsonPath("$.user.mobile").value(mobile))
                .andExpect(jsonPath("$.user.role").value("buyer"))
                .andExpect(jsonPath("$.user.id").exists())
                .andExpect(jsonPath("$.user.name").doesNotExist())
                .andExpect(jsonPath("$.user.mobileVerified").doesNotExist())
                .andReturn();

        Cookie refresh = res.getResponse().getCookie(cookies.name());
        assertThat(refresh).isNotNull();
        assertThat(refresh.getValue()).isNotBlank();
        assertThat(refresh.isHttpOnly()).isTrue();
        assertThat(refresh.getPath()).isEqualTo("/");

        User created = users.findByMobile(mobile).orElseThrow();
        org.assertj.core.api.Assertions.assertThat(created.isMobileVerified()).isTrue();
        org.assertj.core.api.Assertions.assertThat(created.getRole()).isEqualTo("buyer");
        JsonNode b = json.readTree(res.getResponse().getContentAsString());
        org.assertj.core.api.Assertions.assertThat(b.has("otpSent")).isFalse();
        org.assertj.core.api.Assertions.assertThat(b.has("resendAfterSeconds")).isFalse();
    }

    @Test
    void loginVerifyWithWrongOtpReturns401() throws Exception {
        String mobile = "9876500203";
        sendOtp(mobile);
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(mobile, "000000")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"))
                .andExpect(jsonPath("$.status").value(401));
    }

    @Test
    void loginVerifyWithNoActiveOtpReturns401() throws Exception {
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body("9876500204", "123456")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void wrongOtpCountsDownToZeroAndThenStopsReporting() throws Exception {
        String mobile = "9876500207";
        sendOtp(mobile);
        int cap = otpService.maxVerifyAttempts();

        for (int spent = 1; spent <= cap; spent++) {
            mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                            .content(body(mobile, "111111")))
                    .andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.attemptsRemaining").value(cap - spent));
        }

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(mobile, "111111")))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("otp_attempts_exhausted"))
                .andExpect(jsonPath("$.attemptsRemaining").doesNotExist());
    }

    @Test
    void noActiveOtpReportsNoAttemptCount() throws Exception {
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body("9876500208", "123456")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.attemptsRemaining").doesNotExist())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void anArchivedAccountIsRefusedUnderItsOwnCode() throws Exception {
        String mobile = "9876500209";
        User closed = new User(mobile, "buyer");
        closed.archive("closed for this test");
        users.saveAndFlush(closed);
        sendOtp(mobile);

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(mobile, otp.lastCode)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("account_archived"))
                .andExpect(jsonPath("$.attemptsRemaining").doesNotExist());
    }

    @Test
    void closedSignupsRefuseANewMobileButStillAdmitAnExistingOne() throws Exception {
        closeSignups();

        String stranger = "9876500250";
        sendOtp(stranger);
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(stranger, otp.lastCode)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("signups_closed"));
        assertThat(users.findByMobile(stranger)).isEmpty();

        String member = "9876500251";
        users.saveAndFlush(new User(member, "buyer"));
        sendOtp(member);
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(member, otp.lastCode)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void closedSignupsStillBurnTheVerifiedCode() throws Exception {
        closeSignups();
        String stranger = "9876500252";
        sendOtp(stranger);
        String code = otp.lastCode;

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(stranger, code))).andExpect(status().isForbidden());
        assertThat(poisoned())
                .as("the refusal must not poison the transaction that burnt the code")
                .isFalse();

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(body(stranger, code)))
                .andExpect(status().isUnauthorized());
    }

    private boolean poisoned() {
        ConnectionHolder holder = (ConnectionHolder) TransactionSynchronizationManager
                .getResource(jdbc.getDataSource());
        return holder != null && holder.isRollbackOnly();
    }

    private void setFlag(String name, boolean value) {
        int flipped = jdbc.update("update settings set value = "
                + "jsonb_set(value, ?::text[], ?::jsonb) where key = 'flags'",
                "{" + name + "}", String.valueOf(value));
        assertThat(flipped).isEqualTo(1);
        em.flush();
        em.clear();
    }

    private void closeSignups() {
        setFlag("signupsEnabled", false);
    }

    @Test
    void sendsBeyondTheHourlyBudgetAre429EvenWhenTheCooldownHasPassed() throws Exception {
        String mobile = "9876500702";
        for (int i = 0; i < OtpSendBudget.MAX_SENDS_PER_WINDOW; i++) {
            sendOtp(mobile);
            ageOutCooldown(mobile);
        }

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"" + mobile + "\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void sendsBeyondTheDailyBudgetAre429EvenWhenEveryHourIsUnderItsCap() throws Exception {
        String mobile = "9876500711";
        for (int i = 0; i < OtpSendBudget.MAX_SENDS_PER_DAY; i++) {
            sendOtp(mobile);
            ageOut(mobile, OtpSendBudget.SEND_WINDOW.toSeconds() + 1);
        }

        MvcResult res = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"" + mobile + "\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"))
                .andReturn();

        assertThat(Integer.parseInt(res.getResponse().getHeader(HttpHeaders.RETRY_AFTER)))
                .as("waits for the oldest send to leave the day, not the hour")
                .isGreaterThan((int) OtpSendBudget.SEND_WINDOW.toSeconds());
    }

    @Test
    void retryAfterNamesTheLaterReopeningWhenTheHourlyAndDailyCapsBothBind() throws Exception {
        String mobile = "9876500712";
        for (int i = 0; i < OtpSendBudget.MAX_SENDS_PER_DAY; i++) {
            sendOtp(mobile);
            ageOutCooldown(mobile);
            if (i == OtpSendBudget.MAX_SENDS_PER_WINDOW - 1) {
                ageOut(mobile, OtpSendBudget.SEND_WINDOW.toSeconds() + 1);
            }
        }

        MvcResult res = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"" + mobile + "\"}"))
                .andExpect(status().isTooManyRequests())
                .andReturn();

        assertThat(Integer.parseInt(res.getResponse().getHeader(HttpHeaders.RETRY_AFTER)))
                .isGreaterThan((int) OtpSendBudget.SEND_WINDOW.toSeconds());
    }

    @Test
    void exhaustingOneNumbersBudgetDoesNotBlockAnother() throws Exception {
        String victim = "9876500703";
        sendOtp(victim);
        MvcResult res = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"" + victim + "\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"))
                .andExpect(jsonPath("$.status").value(429))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andReturn();

        int retryAfter = Integer.parseInt(res.getResponse().getHeader(HttpHeaders.RETRY_AFTER));
        assertThat(retryAfter)
                .as("Retry-After must be a usable hint, never 0 or longer than the cooldown")
                .isBetween(1, (int) OtpSendBudget.SEND_COOLDOWN.toSeconds());

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"9876500704\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.otpSent").value(true));
    }

    private void ageOutCooldown(String mobile) {
        ageOut(mobile, OtpSendBudget.SEND_COOLDOWN.toSeconds() + 1);
    }

    private void ageOut(String mobile, long seconds) {
        em.flush();
        jdbc.update("update otp_codes set created_at = created_at - (?::text || ' seconds')::interval"
                        + " where mobile = ?",
                seconds, mobile);
        em.clear();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"{}", "{\"mobile\":\"123\"}"})
    void loginMissingOrMalformedMobileReturns422WithFields(String requestBody) throws Exception {
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON).content(requestBody))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("validation_failed"))
                .andExpect(jsonPath("$.status").value(422))
                .andExpect(jsonPath("$.fields[0].field").value("mobile"));
    }

    @Test
    void staffLoginWithGoodPasswordAsksForTheSecondFactorAndIssuesNoTokens() throws Exception {
        seedStaff("9876500301", "ops@draazy.in", "s3cret-pass", "rental");
        mvc.perform(post("/auth/staff-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ops@draazy.in\",\"password\":\"s3cret-pass\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mfa").value("enrol"))
                .andExpect(jsonPath("$.challenge").isNotEmpty())
                .andExpect(jsonPath("$.accessToken").doesNotExist())
                .andExpect(header().doesNotExist(HttpHeaders.SET_COOKIE));
    }

    @Test
    void staffLoginWithBadPasswordReturns401() throws Exception {
        seedStaff("9876500302", "ops2@draazy.in", "s3cret-pass", "legal");
        mvc.perform(post("/auth/staff-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ops2@draazy.in\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void staffLoginUnknownEmailReturns401() throws Exception {
        mvc.perform(post("/auth/staff-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"nobody@draazy.in\",\"password\":\"whatever\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void closedStaffLoginRefusesStaffButStillAdmitsAnAdmin() throws Exception {
        seedStaff("9876500304", "ops3@draazy.in", "s3cret-pass", "rental");
        seedAdmin("9876500305", "boss@draazy.in", "s3cret-pass");
        setFlag("staffLoginEnabled", false);

        mvc.perform(post("/auth/staff-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ops3@draazy.in\",\"password\":\"s3cret-pass\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("forbidden"));

        mvc.perform(post("/auth/staff-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"boss@draazy.in\",\"password\":\"s3cret-pass\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.challenge").isNotEmpty());
    }

    @Test
    void closedStaffLoginStillAnswers401ForABadPassword() throws Exception {
        seedStaff("9876500306", "ops4@draazy.in", "s3cret-pass", "legal");
        setFlag("staffLoginEnabled", false);

        mvc.perform(post("/auth/staff-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"ops4@draazy.in\",\"password\":\"wrong\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void staffLoginIsCaseInsensitiveBecauseUniquenessIs() throws Exception {
        seedStaff("9876500303", "A.Sharma@draazy.in", "s3cret-pass", "legal");
        mvc.perform(post("/auth/staff-login").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\":\"a.sharma@draazy.in\",\"password\":\"s3cret-pass\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.challenge").isNotEmpty());
    }

    @Test
    void refreshRotatesTokensAndOldTokenReuseRevokesFamily() throws Exception {
        String mobile = "9876500401";
        sendOtp(mobile);
        Cookie refresh1 = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body(mobile, otp.lastCode)))
                .andReturn().getResponse().getCookie(cookies.name());
        assertThat(refresh1).isNotNull();

        Cookie refresh2 = mvc.perform(post("/auth/refresh").cookie(refresh1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").doesNotExist())
                .andReturn().getResponse().getCookie(cookies.name());
        assertThat(refresh2).isNotNull();
        assertThat(refresh2.getValue()).isNotEqualTo(refresh1.getValue());

        mvc.perform(post("/auth/refresh").cookie(refresh1))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));

        ConnectionHolder connection = (ConnectionHolder) TransactionSynchronizationManager
                .getResource(jdbc.getDataSource());
        assertThat(connection.isRollbackOnly())
                .as("reuse detection revoked the token family, and that write must survive the 401 "
                        + "it is thrown alongside — see tech-debt D207 and D90")
                .isFalse();

        mvc.perform(post("/auth/refresh").cookie(refresh2))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    void logoutRevokesRefreshFamilyAndRequiresAuth() throws Exception {
        String mobile = "9876500501";
        sendOtp(mobile);
        MockHttpServletResponse login = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body(mobile, otp.lastCode)))
                .andReturn().getResponse();
        String access = json.readTree(login.getContentAsString()).get("accessToken").asText();
        Cookie refresh = login.getCookie(cookies.name());
        assertThat(refresh).isNotNull();

        mvc.perform(post("/auth/logout")).andExpect(status().isUnauthorized());

        Cookie cleared = mvc.perform(post("/auth/logout").header("Authorization", "Bearer " + access))
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getCookie(cookies.name());
        assertThat(cleared).isNotNull();
        assertThat(cleared.getMaxAge()).isZero();

        mvc.perform(post("/auth/refresh").cookie(refresh))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void loginIssuesAReadableSessionHintBesideTheRefreshCookie() throws Exception {
        String mobile = "9876500601";
        sendOtp(mobile);
        MockHttpServletResponse login = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body(mobile, otp.lastCode)))
                .andExpect(status().isOk())
                .andReturn().getResponse();

        Cookie hint = login.getCookie(cookies.hintName());
        assertThat(hint).isNotNull();
        assertThat(hint.isHttpOnly())
                .as("the hint is only useful if the boot path can read it from document.cookie")
                .isFalse();
        assertThat(hint.getPath())
                .as("cookie reads are path-scoped, and the boot check runs on whatever page the "
                        + "visitor landed on")
                .isEqualTo("/");
        assertThat(hint.getMaxAge())
                .as("hint and refresh token must expire together")
                .isEqualTo(login.getCookie(cookies.name()).getMaxAge());
        assertThat(hint.getMaxAge())
                .as("the hint lives for the configured refresh TTL — the whole point of it being a "
                        + "server-set cookie is that Safari's seven-day cap does not apply")
                .isEqualTo((int) jwt.refreshTtl().toSeconds());
        assertThat(hint.getValue())
                .as("the hint answers 'is there a session, and was it meant to last' and must "
                        + "disclose nothing else")
                .doesNotContain(mobile);
        assertThat(hint.getValue())
                .as("the client reads this to restate `remember` on rotation; after an ITP wipe it "
                        + "is the only surviving record of the choice, and a wrong value trades a "
                        + "30-day cookie for a session one during the very refresh that rescued it")
                .isEqualTo("1");
    }

    @Test
    void logoutClearsTheSessionHint() throws Exception {
        String mobile = "9876500602";
        sendOtp(mobile);
        String access = json.readTree(mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body(mobile, otp.lastCode)))
                .andReturn().getResponse().getContentAsString()).get("accessToken").asText();

        Cookie hint = mvc.perform(post("/auth/logout").header("Authorization", "Bearer " + access))
                .andExpect(status().isNoContent())
                .andReturn().getResponse().getCookie(cookies.hintName());
        assertThat(hint).isNotNull();
        assertThat(hint.getMaxAge()).isZero();
        assertThat(hint.getPath())
                .as("a browser only replaces a cookie when name and path match, so a clear built "
                        + "with a different path leaves the original in the jar")
                .isEqualTo("/");
    }

    @Test
    void anUnrememberedSessionGetsASessionScopedHint() throws Exception {
        String mobile = "9876500603";
        sendOtp(mobile);
        MockHttpServletResponse login = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"" + mobile + "\",\"otp\":\"" + otp.lastCode
                                + "\",\"remember\":false}"))
                .andExpect(status().isOk())
                .andReturn().getResponse();

        assertThat(login.getCookie(cookies.hintName()).getMaxAge())
                .as("-1 is the servlet contract for 'no Max-Age' — a cookie that dies with the browser")
                .isEqualTo(-1);
        assertThat(login.getCookie(cookies.hintName()).getValue())
                .as("the value carries the choice as well as the lifetime, so a rotation cannot "
                        + "promote a session the user declined to have remembered")
                .isEqualTo("0");
    }

    @ParameterizedTest(name = "Sec-Fetch-Site={0}")
    @NullSource
    @ValueSource(strings = "same-origin")
    void refreshWithNoCookieAtAllAlsoClearsTheHint(String fetchSite) throws Exception {
        var request = post("/auth/refresh");
        if (fetchSite != null) {
            request.header("Sec-Fetch-Site", fetchSite);
        }
        Cookie hint = mvc.perform(request)
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"))
                .andReturn().getResponse().getCookie(cookies.hintName());

        assertThat(hint).isNotNull();
        assertThat(hint.getMaxAge()).isZero();
    }

    @Test
    void aRefusedRefreshClearsTheSessionHint() throws Exception {
        String mobile = "9876500604";
        sendOtp(mobile);
        Cookie refresh = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body(mobile, otp.lastCode)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getCookie(cookies.name());

        mvc.perform(post("/auth/refresh").cookie(refresh)).andExpect(status().isOk());
        Cookie hint = mvc.perform(post("/auth/refresh").cookie(refresh))
                .andExpect(status().isUnauthorized())
                .andReturn().getResponse().getCookie(cookies.hintName());

        assertThat(hint)
                .as("a 401 that leaves the hint in the jar buys a doomed refresh on every cold boot "
                        + "until the marker's own 30 days run out")
                .isNotNull();
        assertThat(hint.getMaxAge()).isZero();
        assertThat(hint.getPath()).isEqualTo("/");
    }

    @Test
    void aCrossSiteCallerCannotForceTheHintToBeCleared() throws Exception {
        Cookie hint = mvc.perform(post("/auth/refresh").header("Sec-Fetch-Site", "cross-site"))
                .andExpect(status().isForbidden())
                .andReturn().getResponse().getCookie(cookies.hintName());

        assertThat(hint).as("a cross-site POST must not be able to expire our marker").isNull();
    }

    @Test
    void aSameSiteSiblingCannotSpendTheVisitorsRefreshToken() throws Exception {
        String mobile = "9876500801";
        sendOtp(mobile);
        Cookie refresh = mvc.perform(post("/auth/login")
                        .contentType(MediaType.APPLICATION_JSON).content(body(mobile, otp.lastCode)))
                .andReturn().getResponse().getCookie(cookies.name());
        assertThat(refresh).isNotNull();

        mvc.perform(post("/auth/refresh").cookie(refresh)
                        .header("Sec-Fetch-Site", "same-site")
                        .header("Origin", "https://status.draazy.in"))
                .andExpect(status().isForbidden());

        mvc.perform(post("/auth/refresh").cookie(refresh))
                .andExpect(status().isOk());
    }

    private void sendOtp(String mobile) throws Exception {
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"mobile\":\"" + mobile + "\"}")).andExpect(status().isOk());
    }

    private static String body(String mobile, String otp) {
        return "{\"mobile\":\"" + mobile + "\",\"otp\":\"" + otp + "\"}";
    }

    private void seedStaff(String mobile, String email, String rawPassword, String team) {
        User u = new User(mobile, "staff");
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        u.setTeam(team);
        users.saveAndFlush(u);
    }

    private void seedAdmin(String mobile, String email, String rawPassword) {
        User u = new User(mobile, "admin");
        u.setEmail(email);
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        users.saveAndFlush(u);
    }
}
