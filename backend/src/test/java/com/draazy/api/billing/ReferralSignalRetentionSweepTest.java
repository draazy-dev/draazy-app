package com.draazy.api.billing;

import static org.assertj.core.api.Assertions.assertThatCode;

import com.draazy.api.billing.referral.ReferralSignalRetention;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class ReferralSignalRetentionSweepTest {
    @Autowired ReferralSignalRetention retention;

    @Test
    @DisplayName("expireNow() opens its own transaction, so the scheduled sweep can write")
    void expireNowRunsInATransaction() {
        assertThatCode(() -> retention.expireNow())
                .as("the sweep calls expireNow() with no ambient transaction; if it does not start "
                        + "one, the UPDATEs fail with InvalidDataAccessApiUsageException and the "
                        + "D55 ninety-day expiry silently never happens")
                .doesNotThrowAnyException();
    }
}
