package com.draazy.api.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.error.RateLimitedException;
import com.draazy.api.common.error.UnauthorizedException;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.auth.OtpCaptureConfig.CapturingOtpSender;
import com.draazy.api.identity.auth.OtpCaptureConfig.OuterTransaction;
import com.draazy.api.provider.OtpSender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
@Import(OtpCaptureConfig.class)
class OtpServiceDurabilityTest {
    private static final String MOBILE = "9876500911";

    @Autowired
    OtpService otpService;
    @Autowired
    CapturingOtpSender otp;
    @Autowired
    OuterTransaction outer;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    MockMvc mvc;

    @BeforeEach
    @AfterEach
    void clearOwnSendHistory() {
        jdbc.update("delete from otp_codes where mobile = ?", MOBILE);
        otp.failNext = false;
    }

    @Test
    void aFailedDeliveryStillSpendsTheSendBudget() {
        otp.failNext = true;

        assertThatThrownBy(() -> otpService.sendLoginCode(MOBILE))
                .isInstanceOf(OtpSender.DeliveryFailedException.class);

        Integer rows = jdbc.queryForObject(
                "select count(*) from otp_codes where mobile = ?", Integer.class, MOBILE);
        assertThat(rows).isEqualTo(1);
    }

    @Test
    void aFailedDeliverySpendsTheBudgetEvenWhenAnOuterTransactionOwnsIt() {
        otp.failNext = true;

        assertThatThrownBy(() -> outer.sendInsideItsOwnTransaction(MOBILE))
                .isInstanceOf(OtpSender.DeliveryFailedException.class);

        Integer rows = jdbc.queryForObject(
                "select count(*) from otp_codes where mobile = ?", Integer.class, MOBILE);
        assertThat(rows).isEqualTo(1);
    }

    @Test
    void aFailedDeliveryIsA503ThatSaysWhenToRetry() throws Exception {
        otp.failNext = true;

        mvc.perform(post(Routes.Auth.LOGIN).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"" + MOBILE + "\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(header().string(HttpHeaders.RETRY_AFTER, "60"))
                .andExpect(jsonPath("$.status").value(503));
    }

    @Test
    void failedAttemptsAccumulateAcrossTransactionsUntilTheCapTrips() {
        otpService.sendLoginCode(MOBILE);
        String wrong = "000000".equals(otp.lastCode) ? "111111" : "000000";

        for (int i = 0; i < otpService.maxVerifyAttempts(); i++) {
            assertThatThrownBy(() -> otpService.verifyLoginCode(MOBILE, wrong))
                    .isInstanceOf(UnauthorizedException.class);
        }
        assertThatThrownBy(() -> otpService.verifyLoginCode(MOBILE, wrong))
                .isInstanceOf(RateLimitedException.class);
    }
}
