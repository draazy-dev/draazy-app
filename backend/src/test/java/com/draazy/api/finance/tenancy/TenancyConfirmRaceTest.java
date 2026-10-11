package com.draazy.api.finance.tenancy;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.deals.deal.DealCloseRequest;
import com.draazy.api.deals.deal.DealService;
import com.draazy.api.deals.deal.DealStatuses;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.support.Races;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

// Not on AbstractApiTest: its rollback hides commits, and these races only exist across commits.
@SpringBootTest
@DisplayName("Concurrent answers to a pending tenancy")
class TenancyConfirmRaceTest {

    private static final int ROUNDS = 8;
    private static final String OWNER_MOBILE = "9876000441";
    private static final String TENANT_MOBILE = "9876000442";

    @Autowired TenancyService tenancyService;
    @Autowired DealService dealService;
    @Autowired TenancyRepository tenancies;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired JdbcTemplate jdbc;

    private User owner;
    private User tenant;

    @BeforeEach
    void setUp() {
        wipe();
        owner = user(OWNER_MOBILE, "owner");
        tenant = user(TENANT_MOBILE, "buyer");
    }

    @AfterEach
    void cleanUp() {
        wipe();
    }

    private User user(String mobile, String role) {
        User row = new User(mobile, role);
        row.setName("Race " + mobile.substring(6));
        row.setMobileVerified(true);
        return users.saveAndFlush(row);
    }

    private void wipe() {
        String ids = "(select id from users where mobile in (?, ?))";
        jdbc.update("delete from tenancies where owner_id in " + ids, OWNER_MOBILE, TENANT_MOBILE);
        jdbc.update("delete from deals where property_id in (select id from properties where owner_id in "
                + ids + ")", OWNER_MOBILE, TENANT_MOBILE);
        jdbc.update("delete from notifications where user_id in " + ids, OWNER_MOBILE, TENANT_MOBILE);
        jdbc.update("delete from properties where owner_id in " + ids, OWNER_MOBILE, TENANT_MOBILE);
        jdbc.update("delete from users where mobile in (?, ?)", OWNER_MOBILE, TENANT_MOBILE);
    }

    private Property closedRentDeal() {
        Property p = new Property(owner, "Race let", "rent", "apartment", 28000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("950"));
        p = properties.saveAndFlush(p);
        dealService.close(owner.getId(), p.getId(), new DealCloseRequest(28000L, TENANT_MOBILE, null));
        return p;
    }

    @Test
    @DisplayName("a confirm racing a reopen never leaves an active tenancy on the reopened deal")
    void confirmRacingReopen() {
        AuthPrincipal caller = new AuthPrincipal(owner.getId(), "owner", null, true, false);
        for (int round = 0; round < ROUNDS; round++) {
            Property p = closedRentDeal();
            UUID tenancyId = tenancies.findPendingByPropertyId(p.getId()).orElseThrow().getId();

            List<Throwable> outcomes = Races.run(2, index -> {
                if (index == 0) {
                    tenancyService.confirm(tenant.getId(), tenancyId);
                } else {
                    dealService.reopen(caller, p.getId());
                }
            });

            assertThat(outcomes.get(1)).as("reopen always succeeds").isNull();
            assertThat(outcomes.get(0)).satisfiesAnyOf(
                    e -> assertThat(e).isNull(),
                    e -> assertThat(e).isInstanceOf(ConflictException.class));
            assertThat(tenancies.findActiveByPropertyId(p.getId())).isEmpty();
            assertThat(tenancies.findPendingByPropertyId(p.getId())).isEmpty();
            String expected = outcomes.get(0) == null ? TenancyStatuses.ENDED : TenancyStatuses.DECLINED;
            assertThat(tenancies.findById(tenancyId).orElseThrow().getStatus()).isEqualTo(expected);
            assertThat(jdbc.queryForObject("select status from deals where property_id = ?",
                    String.class, p.getId())).isEqualTo(DealStatuses.ACTIVE);
        }
    }

    @Test
    @DisplayName("a confirm racing a decline has exactly one winner, and the row matches it")
    void confirmRacingDecline() {
        for (int round = 0; round < ROUNDS; round++) {
            Property p = closedRentDeal();
            UUID tenancyId = tenancies.findPendingByPropertyId(p.getId()).orElseThrow().getId();

            List<Throwable> outcomes = Races.run(2, index -> {
                if (index == 0) {
                    tenancyService.confirm(tenant.getId(), tenancyId);
                } else {
                    tenancyService.decline(tenant.getId(), tenancyId);
                }
            });

            long winners = outcomes.stream().filter(e -> e == null).count();
            assertThat(winners).isEqualTo(1);
            assertThat(outcomes.stream().filter(e -> e != null)).allSatisfy(
                    e -> assertThat(e).isInstanceOf(ConflictException.class));
            String expected = outcomes.get(0) == null ? TenancyStatuses.ACTIVE : TenancyStatuses.DECLINED;
            assertThat(tenancies.findById(tenancyId).orElseThrow().getStatus()).isEqualTo(expected);
            tenancies.deleteById(tenancyId);
        }
    }
}
