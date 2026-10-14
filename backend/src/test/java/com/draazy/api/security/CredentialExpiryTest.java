package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.auth.RefreshCookie;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.OtpSender;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;

@DisplayName("An expired or already-spent credential is never honoured")
@Import(CredentialExpiryTest.Capture.class)
class CredentialExpiryTest extends AbstractApiTest {

    @TestConfiguration
    static class Capture {
        @Bean
        @Primary
        CapturingSender credentialExpiryCapturingSender() {
            return new CapturingSender();
        }
    }

    static class CapturingSender implements OtpSender {
        volatile String lastCode;

        @Override
        public void send(String mobile, String code) {
            this.lastCode = code;
        }
    }

    @Autowired
    UserRepository users;

    @Autowired
    CapturingSender sender;

    @Autowired
    RefreshCookie cookies;

    @PersistenceContext
    EntityManager em;

    private String persistedBuyer(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setMobileVerified(true);
        users.saveAndFlush(u);
        return mobile;
    }

    private void sendOtp(String mobile) throws Exception {
        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"mobile\":\"" + mobile + "\"}")).andExpect(status().isOk());
        em.flush();
    }

    private static String verifyBody(String mobile, String code) {
        return "{\"mobile\":\"" + mobile + "\",\"otp\":\"" + code + "\"}";
    }

    @Test
    @DisplayName("the right code is refused once its expiry has passed")
    void expiredOtpIsRefused() throws Exception {
        String mobile = persistedBuyer("9791120001");
        sendOtp(mobile);
        jdbc.update("update otp_codes set expires_at = now() - interval '1 minute' where mobile = ?", mobile);
        em.clear();

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody(mobile, sender.lastCode)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    @DisplayName("a code that already logged someone in cannot be replayed")
    void spentOtpCannotBeReplayed() throws Exception {
        String mobile = persistedBuyer("9791120002");
        sendOtp(mobile);
        String code = sender.lastCode;

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody(mobile, code)))
                .andExpect(status().isOk());
        em.flush();

        mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody(mobile, code)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }

    @Test
    @DisplayName("a refresh token past its expires_at is refused")
    void expiredRefreshTokenIsRefused() throws Exception {
        String mobile = persistedBuyer("9791120003");
        sendOtp(mobile);
        Cookie refresh = mvc.perform(post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                        .content(verifyBody(mobile, sender.lastCode)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getCookie(cookies.name());
        assertThat(refresh).isNotNull();
        em.flush();

        int aged = jdbc.update("update refresh_tokens set expires_at = now() - interval '1 minute' "
                + "where user_id = (select id from users where mobile = ?)", mobile);
        assertThat(aged).isEqualTo(1);
        em.clear();

        mvc.perform(post("/auth/refresh").cookie(refresh))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("unauthorized"));
    }
}
