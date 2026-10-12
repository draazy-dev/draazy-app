package com.draazy.api.documents.agreement;

import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "draazy.documents.renewal-reminder.enabled",
        havingValue = "true", matchIfMissing = true)
public class RentAgreementRenewalSweep {

    private static final Logger log = LoggerFactory.getLogger(RentAgreementRenewalSweep.class);

    private final RentAgreementRenewalSweeper sweeper;

    public RentAgreementRenewalSweep(RentAgreementRenewalSweeper sweeper) {
        this.sweeper = sweeper;
    }

    @Scheduled(cron = "0 0 9 * * *", zone = "Asia/Kolkata")
    public void remindEndingAgreements() {
        try {
            int reminded = sweeper.remindEnding(Instant.now());
            if (reminded > 0) {
                log.info("Renewal reminders sent for {} agreement(s)", reminded);
            }
        } catch (RuntimeException e) {
            log.error("Renewal reminders failed; will retry tomorrow", e);
        }
    }
}
