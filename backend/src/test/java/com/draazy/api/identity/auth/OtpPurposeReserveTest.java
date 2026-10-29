package com.draazy.api.identity.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@OtpBudgetContext
@DisplayName("OTP per-purpose reserve")
class OtpPurposeReserveTest extends AbstractApiTest {
    static final int SHARE = OtpBudgetContext.PURPOSE_CAP;

    @Autowired
    UserRepository users;

    @BeforeEach
    void emptyTheWindow() {
        jdbc.update("delete from otp_codes");
    }

    @Test
    void anExhaustedShareRefusesASpenderAndStillServesANewcomer() throws Exception {
        for (int i = 0; i < SHARE; i++) {
            requestConsent(host("987654000" + i), "987654100" + i).andExpect(status().isOk());
        }

        requestConsent(users.findByMobile("9876540000").orElseThrow(), "9876541099")
                .andExpect(status().isTooManyRequests());

        requestConsent(host("9876540099"), "9876541100").andExpect(status().isOk());
    }

    private User host(String mobile) {
        return users.saveAndFlush(new User(mobile, "buyer"));
    }

    private ResultActions requestConsent(User host, String ownerMobile) throws Exception {
        return mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                .header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"ownerMobile\":\"" + ownerMobile + "\","
                        + "\"title\":\"Flat " + ownerMobile + "\",\"locality\":\"Baner\"}"));
    }
}
