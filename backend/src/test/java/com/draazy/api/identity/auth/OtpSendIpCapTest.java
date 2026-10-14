package com.draazy.api.identity.auth;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.annotation.Transactional;

/** Every per-number limit is walked past by rotating the number; this one is keyed on the sender. */
@SpringBootTest(properties = "draazy.otp.max-sends-per-ip-per-window=" + OtpSendIpCapTest.CAP)
@AutoConfigureMockMvc
@Transactional
class OtpSendIpCapTest {

    static final int CAP = 2;

    @Autowired
    MockMvc mvc;

    @Test
    void oneAddressRotatingNumbersIsStoppedAtItsCap() throws Exception {
        for (int i = 0; i < CAP; i++) {
            requestCode("987651400" + i, "203.0.113.7").andExpect(status().isOk());
        }

        requestCode("9876514099", "203.0.113.7")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("rate_limited"))
                .andExpect(header().exists(HttpHeaders.RETRY_AFTER));
    }

    @Test
    void anotherAddressKeepsItsOwnBudget() throws Exception {
        for (int i = 0; i < CAP; i++) {
            requestCode("987651410" + i, "203.0.113.8").andExpect(status().isOk());
        }

        requestCode("9876514199", "203.0.113.9").andExpect(status().isOk());
    }

    @Test
    void verifyingACodeDoesNotSpendTheBudget() throws Exception {
        for (int i = 0; i < CAP + 1; i++) {
            mvc.perform(post(Routes.Auth.LOGIN).contentType(MediaType.APPLICATION_JSON)
                            .content("{\"mobile\":\"9876514200\",\"otp\":\"123456\"}")
                            .with(r -> {
                                r.setRemoteAddr("203.0.113.10");
                                return r;
                            }))
                    .andExpect(status().is4xxClientError());
        }

        requestCode("9876514201", "203.0.113.10").andExpect(status().isOk());
    }

    private ResultActions requestCode(String mobile, String address) throws Exception {
        return mvc.perform(post(Routes.Auth.LOGIN).contentType(MediaType.APPLICATION_JSON)
                .content("{\"mobile\":\"" + mobile + "\"}")
                .with(r -> {
                    r.setRemoteAddr(address);
                    return r;
                }));
    }
}
