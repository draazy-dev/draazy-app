package com.draazy.api.finance.ledger;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.util.AopTestUtils;

class FinanceIstBoundaryTest extends AbstractApiTest {
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired FinanceService financeService;

    private static final Instant IST_NEW_FY_MIDNIGHT = Instant.parse("2026-03-31T20:00:00Z");

    private static final LocalDate FIRST_OF_NEW_FY = LocalDate.of(2026, 4, 1);

    private static final LocalDate LAST_FY = LocalDate.of(2026, 3, 20);

    private static final long NEW_FY_INCOME = 500_000L;
    private static final long LAST_FY_INCOME = 700_000L;

    @AfterEach
    void unpinClock() {
        target().useClock(null);
    }

    private FinanceService target() {
        return AopTestUtils.getTargetObject(financeService);
    }

    private void pinToIstNewFinancialYear() {
        target().useClock(Clock.fixed(IST_NEW_FY_MIDNIGHT, ZoneOffset.UTC));
    }

    private User owner(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Boundary Owner " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "Boundary listing", "rent", "apartment",
                25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private void income(User owner, Property p, long amount, LocalDate date) throws Exception {
        mvc.perform(post("/me/finances/" + p.getId() + "/transactions")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"income\",\"amount\":" + amount
                                + ",\"date\":\"" + date + "\"}"))
                .andExpect(status().isCreated());
    }

    private Property ledgerStraddlingTheFyBoundary(User owner) throws Exception {
        Property p = listing(owner);
        income(owner, p, LAST_FY_INCOME, LAST_FY);
        income(owner, p, NEW_FY_INCOME, FIRST_OF_NEW_FY);
        return p;
    }

    @Test
    void summaryPeriodYear_startsOnTheIndianFyBoundary_notTheHostsPreviousDay() throws Exception {
        User owner = owner("9833100001");
        Property p = ledgerStraddlingTheFyBoundary(owner);

        pinToIstNewFinancialYear();

        mvc.perform(get("/me/finances/" + p.getId() + "/summary?period=all")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.income").value(LAST_FY_INCOME + NEW_FY_INCOME));

        mvc.perform(get("/me/finances/" + p.getId() + "/summary?period=year")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.income").value(NEW_FY_INCOME));
    }

    @Test
    void summaryPeriodMonth_startsOnTheIndianMonth_notTheHostsPreviousOne() throws Exception {
        User owner = owner("9833100002");
        Property p = ledgerStraddlingTheFyBoundary(owner);

        pinToIstNewFinancialYear();

        mvc.perform(get("/me/finances/" + p.getId() + "/summary?period=month")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.income").value(NEW_FY_INCOME));
    }

    @Test
    void cashflow_endsWithTheIndianMonth_notTheHostsPreviousOne() throws Exception {
        User owner = owner("9833100003");
        Property p = ledgerStraddlingTheFyBoundary(owner);

        pinToIstNewFinancialYear();

        mvc.perform(get("/me/finances/" + p.getId() + "/overview?months=1")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.cashflow.length()").value(1))
                .andExpect(jsonPath("$.cashflow[0].month").value("2026-04"))
                .andExpect(jsonPath("$.cashflow[0].income").value(NEW_FY_INCOME));
    }

    @Test
    void dues_countDaysFromTheIndianDate_notTheHostsPreviousDay() throws Exception {
        User owner = owner("9833100004");
        Property p = listing(owner);

        mvc.perform(post("/me/finances/" + p.getId() + "/transactions")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"expense\",\"category\":\"Home loan EMI\","
                                + "\"amount\":250000,\"date\":\"2026-01-01\","
                                + "\"recurring\":\"monthly\"}"))
                .andExpect(status().isCreated());

        pinToIstNewFinancialYear();

        mvc.perform(get("/me/finances/" + p.getId() + "/overview")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dues.length()").value(1))
                .andExpect(jsonPath("$.dues[0].nextDue").value(FIRST_OF_NEW_FY.toString()))
                .andExpect(jsonPath("$.dues[0].daysUntil").value(0));
    }
}
