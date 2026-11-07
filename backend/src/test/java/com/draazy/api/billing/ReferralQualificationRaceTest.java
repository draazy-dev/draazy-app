package com.draazy.api.billing;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.billing.referral.ReferralQualification;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.settings.SettingsCache;
import com.draazy.api.identity.user.User;
import com.draazy.api.support.AbstractCommittedApiTest;
import com.draazy.api.support.Races;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

@DisplayName("Two referees of one referrer qualifying at once cannot both fit under the cap")
class ReferralQualificationRaceTest extends AbstractCommittedApiTest {
    @Autowired ReferralQualification qualification;
    @Autowired TransactionTemplate tx;
    @Autowired SettingsCache settingsCache;
    @Autowired PropertyRepository propertyRepository;

    private String originalCap;

    @Override
    protected String mobilePrefix() {
        return "98201991";
    }

    @AfterEach
    void restore() {
        tx.executeWithoutResult(s -> {
            jdbc.update("delete from referrals where referrer_mobile like ?", mobilePrefix() + "%");
            jdbc.update("delete from properties where owner_id in (select id from users where mobile like ?)",
                    mobilePrefix() + "%");
            if (originalCap != null) {
                jdbc.update("update settings set value = jsonb_set(value, '{referralQualifyPerMonth}', ?::jsonb) "
                        + "where key = 'fees'", originalCap);
            }
        });
        settingsCache.evictAfterCommit();
    }

    @Test
    @DisplayName("a cap of one, two racing qualifications: exactly one is granted and one is cap_reached")
    void theCapHoldsUnderConcurrency() {
        originalCap = jdbc.queryForObject(
                "select value->>'referralQualifyPerMonth' from settings where key = 'fees'", String.class);
        jdbc.update("update settings set value = jsonb_set(value, '{referralQualifyPerMonth}', '1') "
                + "where key = 'fees'");
        settingsCache.evictAfterCommit();
        User referrer = user("01", "owner");
        User[] referees = {user("02", "owner"), user("03", "owner")};
        for (User referee : referees) {
            jdbc.update("""
                    insert into referrals (referrer_id, referrer_mobile, referred_mobile, channel, status, risk)
                    values (?, ?, ?, 'owner', 'pending', 'low')
                    """, referrer.getId(), referrer.getMobile(), referee.getMobile());
        }

        UUID[] properties = new UUID[2];
        for (int i = 0; i < 2; i++) {
            User owner = referees[i];
            properties[i] = tx.execute(s -> {
                Property p = new Property(owner, "Race flat", "rent", "apartment", 25000L, "Kothrud", "Pune");
                p.setBhk(new BigDecimal("2"));
                p.setStatus("approved");
                p.setPriceUnit("per-month");
                p.setArea(new BigDecimal("1000"));
                return propertyRepository.saveAndFlush(p).getId();
            });
        }

        List<Throwable> outcomes = Races.run(2, i -> tx.executeWithoutResult(s -> {
            qualification.announceOwnershipVerified(referees[i].getId(), properties[i], Instant.now());
            pause();
        }));

        assertThat(outcomes).containsOnlyNulls();
        assertThat(jdbc.queryForList(
                "select coalesce(auto_reason, status) from referrals where referrer_id = ? order by 1",
                String.class, referrer.getId())).containsExactly("cap_reached", "qualified");
    }

    private static void pause() {
        try {
            Thread.sleep(300);
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
    }
}
