package com.draazy.api.identity.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

@OtpBudgetContext
@Transactional
@DisplayName("OTP platform-wide send cap (M5)")
class OtpPlatformSendCapTest {
    private static final int CAP = OtpBudgetContext.PLATFORM_CAP;

    @Autowired
    MockMvc mvc;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void emptyTheWindow() {
        jdbc.update("delete from otp_codes");
    }

    @Test
    void aRotatingRecipientIsStoppedEvenThoughNoNumberExceedsItsOwnBudget() throws Exception {
        for (int i = 0; i < CAP; i++) {
            requestCode("987651200" + i).andExpect(status().isOk());
        }

        requestCode("9876512099")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"))
                .andExpect(jsonPath("$.message").value(
                        "Login codes are temporarily unavailable — please try again later"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void sendsBelowTheCapAreUntouched()throws Exception {
        for (int i = 0; i < CAP; i++) {
            requestCode("987651300" + i).andExpect(status().isOk())
                    .andExpect(jsonPath("$.otpSent").value(true));
        }
    }

    private ResultActions requestCode(String mobile) throws Exception {
        return mvc.perform(post(Routes.Auth.LOGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"mobile\":\"" + mobile + "\"}"));
    }
}
