package com.draazy.api.identity.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@SpringBootTest(properties = {
    "draazy.otp.max-caller-sends-per-window=" + OtpCallerSendCapTest.CAP,
    "draazy.otp.send-cooldown-seconds=0",
})
@DisplayName("OTP per-caller quota")
class OtpCallerSendCapTest extends AbstractApiTest {
    static final int CAP = 2;

    @Autowired
    UserRepository users;

    @BeforeEach
    void emptyTheWindow() {
        jdbc.update("delete from otp_codes");
    }

    @Test
    void oneAccountCannotRotateTheRecipientPastItsOwnQuota() throws Exception {
        User host = host("9876530001");

        for (int i = 0; i < CAP; i++) {
            requestConsent(host, "987653100" + i).andExpect(status().isOk());
        }

        requestConsent(host, "9876531099")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"));
    }

    @Test
    void anExhaustedCallerLeavesEveryOtherCallerAlone() throws Exception {
        User spender = host("9876530002");
        for (int i = 0; i < CAP; i++) {
            requestConsent(spender, "987653200" + i).andExpect(status().isOk());
        }
        requestConsent(spender, "9876532099").andExpect(status().isTooManyRequests());

        User bystander = host("9876530003");
        requestConsent(bystander, "9876532100").andExpect(status().isOk());
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
