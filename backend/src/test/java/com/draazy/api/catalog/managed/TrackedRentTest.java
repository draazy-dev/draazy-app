package com.draazy.api.catalog.managed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

@DisplayName("Tracked rent — the tenant's side of an owner's rent tracker")
class TrackedRentTest extends AbstractApiTest {

    private static final String THIS_MONTH = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
    private static final String LAST_MONTH = YearMonth.now(ZoneId.of("Asia/Kolkata")).minusMonths(1).toString();
    // In the past so a receipt for it is allowed, and with day-of-month room on either side.
    private static final LocalDate TODAY = LocalDate.of(2025, 3, 10);

    @Autowired
    UserRepository users;
    @Autowired
    TrackedRentService trackedRent;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    EntityManager em;

    private User user(String mobile, String name) {
        User u = new User(mobile, "owner");
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String rentedFlat(User owner, String tenantMobile, int dueDay) throws Exception {
        String json = mvc.perform(post(Routes.MeManagedProperties.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"2 BHK in Baner\",\"deal\":\"rent\",\"propertyType\":\"Flat\","
                                + "\"price\":26000,\"locality\":\"Baner\",\"rented\":true,"
                                + "\"tenantName\":\"Rohit Kulkarni\",\"tenantMobile\":\"" + tenantMobile + "\","
                                + "\"dueDay\":" + dueDay + "}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");
    }

    private void recordMonth(User owner, String id, String month) throws Exception {
        mvc.perform(post(Routes.MeManagedProperties.BASE + "/" + id + "/rent-receipts")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + month + "\"}"))
                .andExpect(status().isCreated());
    }

    private List<String> noteTypes(User u) {
        return jdbc.queryForList("select type from notifications where user_id = ? order by created_at, id",
                String.class, u.getId());
    }

    @Test
    @DisplayName("the tenant is linked by mobile, notified, and sees receipts minted since they were named")
    void tenantSeesTheirTrackedRent() throws Exception {
        User owner = user("9861005001", "Asha Patil");
        User tenant = user("9861005002", "Rohit Kulkarni");
        String id = rentedFlat(owner, tenant.getMobile(), 7);
        recordMonth(owner, id, LAST_MONTH);

        assertThat(noteTypes(tenant)).containsExactly(TrackedRentService.TRACKING, TrackedRentService.RECEIPT);
        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].landlordName").value("Asha Patil"))
                .andExpect(jsonPath("$[0].monthlyRent").value(26000))
                .andExpect(jsonPath("$[0].dueDay").value(7))
                .andExpect(jsonPath("$[0].address").value("Baner, Pune"))
                .andExpect(jsonPath("$[0].receipts.length()").value(1))
                .andExpect(jsonPath("$[0].receipts[0].rentMonth").value(LAST_MONTH));
        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    @DisplayName("a tenant who signs up later is linked; the month a predecessor paid reads paid, its receipt stays hidden")
    void replacedTenantLosesAccessAndSuccessorStartsClean() throws Exception {
        User owner = user("9861005011", "Asha Patil");
        User first = user("9861005012", "Rohit Kulkarni");
        String id = rentedFlat(owner, first.getMobile(), 5);
        recordMonth(owner, id, THIS_MONTH);

        mvc.perform(patch(Routes.MeManagedProperties.BASE + "/" + id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"tenantName\":\"Neha Joshi\",\"tenantMobile\":\"9861005013\"}"))
                .andExpect(status().isOk());
        User later = user("9861005013", "Neha Joshi");

        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(first)))
                .andExpect(jsonPath("$.length()").value(0));
        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(later)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].status").value("paid"))
                .andExpect(jsonPath("$[0].receipts.length()").value(0));
    }

    @Test
    @DisplayName("reminders: heads-up to tenant, due day to owner, overdue to both; paid or pre-tenancy months quiet")
    void remindersFollowTheDueDay() throws Exception {
        User owner = user("9861005021", "Asha Patil");
        User headsUp = user("9861005022", "Tenant Soon");
        User dueToday = user("9861005023", "Tenant Today");
        User late = user("9861005024", "Tenant Late");
        User paid = user("9861005025", "Tenant Paid");
        User namedLate = user("9861005026", "Tenant New");
        rentedFlat(owner, headsUp.getMobile(), TODAY.getDayOfMonth() + TrackedRentService.HEADS_UP_DAYS);
        rentedFlat(owner, dueToday.getMobile(), TODAY.getDayOfMonth());
        rentedFlat(owner, late.getMobile(), TODAY.getDayOfMonth() - TrackedRentService.OVERDUE_DAYS);
        String paidId = rentedFlat(owner, paid.getMobile(), TODAY.getDayOfMonth());
        recordMonth(owner, paidId, YearMonth.from(TODAY).toString());
        em.flush();
        jdbc.update("update managed_properties set tenant_since = timestamptz '2025-01-01 00:00+05:30' where owner_id = ?",
                owner.getId());
        String lateId = rentedFlat(owner, namedLate.getMobile(), TODAY.getDayOfMonth() - TrackedRentService.OVERDUE_DAYS);
        jdbc.update("update managed_properties set tenant_since = ? where id = ?::uuid",
                Timestamp.valueOf(TODAY.minusDays(2).atStartOfDay()), lateId);
        em.clear();
        jdbc.update("delete from notifications where user_id in (?, ?, ?, ?, ?, ?)",
                owner.getId(), headsUp.getId(), dueToday.getId(), late.getId(), paid.getId(), namedLate.getId());

        assertThat(trackedRent.remindDue(TODAY)).isGreaterThanOrEqualTo(3);

        assertThat(noteTypes(headsUp)).containsExactly(TrackedRentService.DUE);
        assertThat(noteTypes(dueToday)).isEmpty();
        assertThat(noteTypes(late)).containsExactly(TrackedRentService.OVERDUE);
        assertThat(noteTypes(paid)).isEmpty();
        assertThat(noteTypes(namedLate)).isEmpty();
        assertThat(noteTypes(owner)).containsExactlyInAnyOrder(TrackedRentService.DUE, TrackedRentService.OVERDUE);
    }
}
