package com.draazy.api.catalog.managed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
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

@DisplayName("Rent loop — the tenant says paid, the owner confirms, receipts carry the landlord's PAN")
class RentLoopTest extends AbstractApiTest {
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

    private String dueMonth(User tenant) throws Exception {
        String json = mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^.*?\"dueOn\":\"([0-9]{4}-[0-9]{2})-[0-9]{2}\".*$", "$1");
    }

    private List<String> noteTypes(User u) {
        return jdbc.queryForList("select type from notifications where user_id = ? order by created_at, id",
                String.class, u.getId());
    }

    @Test
    @DisplayName("the tenant's 'I've paid' asks the owner once; the owner's receipt settles it")
    void tenantSaysPaidAndOwnerConfirms() throws Exception {
        User owner = user("9861006001", "Asha Patil");
        User tenant = user("9861006002", "Rohit Kulkarni");
        String id = rentedFlat(owner, tenant.getMobile(), 28);
        String month = dueMonth(tenant);

        for (int i = 0; i < 2; i++) {
            mvc.perform(post(Routes.MeManagedProperties.TRACKED_RENT_PAID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("claimed"))
                    .andExpect(jsonPath("$.dueOn").value(org.hamcrest.Matchers.startsWith(month)));
        }
        assertThat(noteTypes(owner)).containsOnlyOnce(TrackedRentService.CLAIMED);
        mvc.perform(get(Routes.MeManagedProperties.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.rentClaims[0]").value(month));

        mvc.perform(post(Routes.MeManagedProperties.RENT_RECEIPTS, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + month + "\"}"))
                .andExpect(status().isCreated());

        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$[0].status").value("paid"));
        mvc.perform(get(Routes.MeManagedProperties.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.rentClaims.length()").value(0));
    }

    @Test
    @DisplayName("the owner can say the rent has not arrived; the tenant is told and the month is unpaid again")
    void ownerRejectsTheClaim() throws Exception {
        User owner = user("9861006011", "Asha Patil");
        User tenant = user("9861006012", "Rohit Kulkarni");
        String id = rentedFlat(owner, tenant.getMobile(), 28);
        String month = dueMonth(tenant);
        mvc.perform(post(Routes.MeManagedProperties.TRACKED_RENT_PAID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk());

        mvc.perform(delete(Routes.MeManagedProperties.RENT_CLAIM, id, month)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isNotFound());
        mvc.perform(delete(Routes.MeManagedProperties.RENT_CLAIM, id, month)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());

        assertThat(noteTypes(tenant)).contains(TrackedRentService.CLAIM_REJECTED);
        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$[0].status").value(org.hamcrest.Matchers.oneOf("due", "overdue")));
        mvc.perform(get(Routes.MeManagedProperties.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.rentClaims.length()").value(0));
    }

    @Test
    @DisplayName("only the named tenant can say a home's rent is paid")
    void onlyTheTenantCanClaim() throws Exception {
        User owner = user("9861006021", "Asha Patil");
        User tenant = user("9861006022", "Rohit Kulkarni");
        User stranger = user("9861006023", "Someone Else");
        String id = rentedFlat(owner, tenant.getMobile(), 28);

        for (User caller : List.of(owner, stranger)) {
            mvc.perform(post(Routes.MeManagedProperties.TRACKED_RENT_PAID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                    .andExpect(status().isNotFound());
        }
        assertThat(jdbc.queryForObject("select count(*) from managed_property_rent_claims", Long.class))
                .isZero();
    }

    @Test
    @DisplayName("the owner's PAN reaches the tenant for HRA receipts, is validated, and can be cleared")
    void landlordPanReachesTheTenant() throws Exception {
        User owner = user("9861006031", "Asha Patil");
        User tenant = user("9861006032", "Rohit Kulkarni");
        String id = rentedFlat(owner, tenant.getMobile(), 5);

        mvc.perform(patch(Routes.MeManagedProperties.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"landlordPan\":\"abcde1234f\"}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(patch(Routes.MeManagedProperties.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"landlordPan\":\"ABCPE1234F\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.landlordPan").value("ABCPE1234F"));
        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$[0].landlordPan").value("ABCPE1234F"));

        mvc.perform(patch(Routes.MeManagedProperties.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"landlordPan\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.landlordPan").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    @DisplayName("a month the tenant says is paid gets no due or overdue nags")
    void claimedMonthIsQuiet() throws Exception {
        User owner = user("9861006041", "Asha Patil");
        User tenant = user("9861006042", "Tenant Late");
        String id = rentedFlat(owner, tenant.getMobile(), TODAY.getDayOfMonth() - TrackedRentService.OVERDUE_DAYS);
        em.flush();
        jdbc.update("update managed_properties set tenant_since = timestamptz '2025-01-01 00:00+05:30' where id = ?::uuid",
                id);
        jdbc.update("insert into managed_property_rent_claims (managed_property_id, rent_month, created_at)"
                + " values (?::uuid, '2025-03', timestamptz '2025-03-06 10:00+05:30')", id);
        em.clear();
        jdbc.update("delete from notifications where user_id in (?, ?)", owner.getId(), tenant.getId());

        trackedRent.remindDue(TODAY);

        assertThat(noteTypes(owner)).isEmpty();
        assertThat(noteTypes(tenant)).isEmpty();
    }

    @Test
    @DisplayName("a tenant named after the due day owes from next month, and the owner is told the same month")
    void ownerSeesTheTenantsFirstRentMonth() throws Exception {
        User owner = user("9861006051", "Asha Patil");
        User tenant = user("9861006052", "Tenant Fresh");
        String id = rentedFlat(owner, tenant.getMobile(), 5);
        em.flush();

        jdbc.update("update managed_properties set tenant_since = timestamptz '2025-03-10 09:00+05:30' where id = ?::uuid",
                id);
        em.clear();
        mvc.perform(get(Routes.MeManagedProperties.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.firstRentMonth").value("2025-04"));

        jdbc.update("update managed_properties set tenant_since = timestamptz '2025-03-05 09:00+05:30' where id = ?::uuid",
                id);
        em.clear();
        mvc.perform(get(Routes.MeManagedProperties.BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.firstRentMonth").value("2025-03"));
    }

    @Test
    @DisplayName("the owner can confirm an early first rent the tenant claimed, but no month beyond it")
    void ownerConfirmsAnEarlyFirstRent() throws Exception {
        User owner = user("9861006061", "Asha Patil");
        User tenant = user("9861006062", "Tenant Early");
        String id = rentedFlat(owner, tenant.getMobile(), 5);
        em.flush();
        YearMonth now = YearMonth.now(ZoneId.of("Asia/Kolkata"));
        String first = now.plusMonths(1).toString();
        jdbc.update("update managed_properties set tenant_since = ?::timestamptz where id = ?::uuid",
                now.atDay(20) + " 09:00+05:30", id);
        em.clear();

        mvc.perform(post(Routes.MeManagedProperties.TRACKED_RENT_PAID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.dueOn").value(org.hamcrest.Matchers.startsWith(first)));

        mvc.perform(post(Routes.MeManagedProperties.RENT_RECEIPTS, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + now.plusMonths(2) + "\"}"))
                .andExpect(status().isUnprocessableEntity());
        mvc.perform(post(Routes.MeManagedProperties.RENT_RECEIPTS, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rentMonth\":\"" + first + "\"}"))
                .andExpect(status().isCreated());

        mvc.perform(get(Routes.MeManagedProperties.TRACKED_RENT).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(jsonPath("$[0].status").value("paid"))
                .andExpect(jsonPath("$[0].dueOn").value(org.hamcrest.Matchers.startsWith(first)));
    }
}
