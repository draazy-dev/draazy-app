package com.draazy.api.identity.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class OtpSendRateLimitStatusTest {
    private static final String MOBILE = "9876500912";

    @Autowired
    MockMvc mvc;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clearOwnSendHistory() {
        jdbc.update("delete from otp_codes where mobile = ?", MOBILE);
    }

    @Test
    void secondSendInsideTheCooldownAnswers429WithARetryAfterHint() throws Exception {
        mvc.perform(login()).andExpect(status().isOk())
                .andExpect(jsonPath("$.otpSent").value(true));

        mvc.perform(login())
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"))
                .andExpect(jsonPath("$.message").value(
                        "A code was just sent — wait a moment before requesting another"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    private static org.springframework.test.web.servlet.RequestBuilder login() {
        return post("/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content("{\"mobile\":\"" + MOBILE + "\"}");
    }
}
