package com.draazy.api.moderation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("POST /reports — per-user hourly throttle")
class ReportThrottleTest extends AbstractApiTest {

    private static final int HOURLY_LIMIT = 10;

    @Autowired
    UserRepository users;

    private User user(String mobile) {
        User u = new User(mobile, "buyer");
        u.setName("Reporter");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private org.springframework.test.web.servlet.ResultActions report(User who, int n) throws Exception {
        return mvc.perform(post("/reports").contentType(MediaType.APPLICATION_JSON)
                .header(HttpHeaders.AUTHORIZATION, bearer(who))
                .content("{\"targetType\":\"property\",\"targetId\":\"listing-" + n + "\","
                        + "\"reason\":\"spam\",\"details\":\"flood " + n + "\"}"));
    }

    @Test
    void theEleventhReportInAnHourIsRefusedWithRetryAfter_andOtherUsersAreUnaffected() throws Exception {
        User flooder = user("9891300002");
        for (int i = 0; i < HOURLY_LIMIT; i++) {
            report(flooder, i).andExpect(status().isCreated());
        }

        report(flooder, HOURLY_LIMIT)
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER))
                .andExpect(jsonPath("$.error").value("rate_limited"));

        report(user("9891300003"), 0).andExpect(status().isCreated());
    }
}
