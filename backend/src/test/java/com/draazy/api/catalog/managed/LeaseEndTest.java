package com.draazy.api.catalog.managed;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.managed.ManagedAgreementHomes.Lease;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.agreement.RentAgreementRenewalSweeper;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import jakarta.persistence.EntityManager;
import org.springframework.http.HttpHeaders;

@DisplayName("Lease end: reminders, renewal prefill and relist date")
class LeaseEndTest extends AbstractApiTest {
    private static final Instant NOW = Instant.parse("2026-10-11T04:00:00Z");
    private static final LocalDate TODAY = NOW.atZone(PlatformTime.IST).toLocalDate();
    private static final String TENANT = "9820008101";
    private static final String HOME_RENEWAL = "/me/rent-agreements/homes/{homeId}/renewal";

    @Autowired UserRepository users;
    @Autowired ManagedAgreementHomes homes;
    @Autowired ManagedLeaseEnds leaseEnds;
    @Autowired RentAgreementRenewalSweeper agreementSweeper;
    @Autowired PropertyRepository properties;
    @Autowired EntityManager em;

    private User user(String mobile, String role, String name) {
        User u = new User(mobile, role);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private UUID request(User owner, String prop) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into service_requests (id, requester_id, type, team, status, details)
                values (?, ?, 'rent-agreement', 'rental', 'completed', cast(? as jsonb))
                """, id, owner.getId(), "{\"months\":11,\"_state\":{\"prop\":" + prop
                        + ",\"terms\":{\"months\":\"11\"},\"tenants\":[{\"name\":\"Kiran Tenant\",\"mobile\":\""
                        + TENANT + "\"}]}}");
        return id;
    }

    private UUID home(User owner, String flatKey, LocalDate leaseEnd, UUID requestId) {
        return homes.record(new Lease(owner.getId(), null, flatKey, null, "Flat / Apartment", new BigDecimal("2"),
                "Kothrud", "Green Meadows", new BigDecimal("950"), "sqft", "Kiran Tenant", TENANT, 25000, 5,
                leaseEnd, 100000L, requestId), null);
    }

    private UUID home(User owner, String flatKey, LocalDate leaseEnd) {
        return home(owner, flatKey, leaseEnd, request(owner, "{\"flatNo\":\"" + flatKey + "\"}"));
    }

    private List<Map<String, Object>> notes(User user) {
        return jdbc.queryForList("select type, title, link from notifications where user_id = ? order by id",
                user.getId());
    }

    private boolean reminded(UUID homeId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select renewal_reminded_at is not null from managed_properties where id = ?", Boolean.class, homeId));
    }

    @Test
    @DisplayName("homes whose lease ends today to sixty days out are reminded once, owner and tenant")
    void remindsInsideTheWindowOnce() {
        User owner = user("9820008001", "owner", "Asha Patil");
        User tenant = user(TENANT, "buyer", "Kiran Tenant");
        UUID soon = home(owner, "A-1", TODAY.plusDays(30));
        UUID lastDay = home(owner, "A-2", TODAY.plusDays(60));
        UUID tooFar = home(owner, "A-3", TODAY.plusDays(61));
        UUID past = home(owner, "A-4", TODAY.minusDays(1));

        assertThat(leaseEnds.remindEnding(NOW)).isEqualTo(2);

        assertThat(List.of(soon, lastDay)).allMatch(this::reminded);
        assertThat(List.of(tooFar, past)).noneMatch(this::reminded);
        assertThat(notes(owner)).extracting(n -> n.get("type"), n -> n.get("link")).contains(
                tuple("lease.ending", "/owner-hub/property/" + soon),
                tuple("lease.ending", "/owner-hub/property/" + lastDay));
        assertThat(notes(tenant)).filteredOn(n -> "lease.ending".equals(n.get("type")))
                .hasSize(2).allMatch(n -> "/dashboard#rental".equals(n.get("link")));

        assertThat(leaseEnds.remindEnding(NOW)).isZero();
    }

    @Test
    @DisplayName("a renewal that moves the lease end re-arms the reminder; the same end does not")
    void newLeaseEndRearmsTheReminder() {
        User owner = user("9820008002", "owner", "Asha Patil");
        UUID requestId = request(owner, "{\"flatNo\":\"B-1\"}");
        UUID id = home(owner, "B-1", TODAY.plusDays(20), requestId);
        leaseEnds.remindEnding(NOW);
        assertThat(reminded(id)).isTrue();

        home(owner, "B-1", TODAY.plusDays(20), requestId);
        assertThat(reminded(id)).isTrue();

        home(owner, "B-1", TODAY.plusDays(355), request(owner, "{\"flatNo\":\"B-1\"}"));
        assertThat(reminded(id)).isFalse();
    }

    @Test
    @DisplayName("an agreement that seeded a home is left to the home's reminder, so nobody is told twice")
    void agreementSweeperSkipsSeededHomes() {
        User owner = user("9820008003", "owner", "Asha Patil");
        UUID requestId = request(owner, "{\"flatNo\":\"C-1\"}");
        home(owner, "C-1", TODAY.plusDays(30), requestId);
        Property listing = new Property(owner, "Flat C-1", "rent", "apartment", 25000L, "Kothrud", "Pune");
        listing.setBhk(new BigDecimal("2"));
        listing.setStatus("approved");
        listing.setPriceUnit("per-month");
        listing.setArea(new BigDecimal("1000"));
        UUID propertyId = properties.saveAndFlush(listing).getId();
        jdbc.update("""
                insert into rent_agreements (id, property_id, owner_id, tenant_mobile, rent, status, start_date,
                    duration_months, service_request_id)
                values (gen_random_uuid(), ?, ?, ?, 25000, 'registered', cast(? as date), 11, ?)
                """, propertyId, owner.getId(), TENANT, TODAY.plusDays(30).minusMonths(11).toString(), requestId);

        assertThat(agreementSweeper.remindEnding(NOW)).isZero();
    }

    @Test
    @DisplayName("the home renewal prefills owner and tenant, starts on the lease end, and leaks no stray keys")
    void homeRenewalPrefill() throws Exception {
        User owner = user("9820008004", "owner", "Asha Patil");
        User tenant = user(TENANT, "buyer", "Kiran Tenant");
        User stranger = user("9820008204", "buyer", "Stranger");
        LocalDate end = TODAY.plusDays(40);
        UUID id = home(owner, "D-1", end, request(owner, """
                {"propType":"Flat / Apartment","flatNo":"D-1","society":"Green Meadows","locality":"Kothrud",
                 "city":"Pune","pincode":"411038","area":"950","areaUnit":"sqft","gramPanchayat":false,
                 "ownerAadhaar":"123412341234"}
                """));

        mvc.perform(get(HOME_RENEWAL, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rent").value(25000))
                .andExpect(jsonPath("$.deposit").value(100000))
                .andExpect(jsonPath("$.months").value(11))
                .andExpect(jsonPath("$.startDate").value(end.toString()))
                .andExpect(jsonPath("$.owner.mobile").value(owner.getMobile()))
                .andExpect(jsonPath("$.tenants[0].mobile").value(TENANT))
                .andExpect(jsonPath("$.tenants[0].name").value("Kiran Tenant"))
                .andExpect(jsonPath("$.prop.flatNo").value("D-1"))
                .andExpect(jsonPath("$.prop.society").value("Green Meadows"))
                .andExpect(jsonPath("$.prop.pincode").value("411038"))
                .andExpect(jsonPath("$.prop.ownerAadhaar").doesNotExist())
                .andExpect(jsonPath("$.prop.gramPanchayat").doesNotExist());

        mvc.perform(get(HOME_RENEWAL, id).header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.startDate").value(end.toString()));

        mvc.perform(get(HOME_RENEWAL, id).header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());

        jdbc.update("update managed_properties set rented = false where id = ?", id);
        em.clear();
        mvc.perform(get(HOME_RENEWAL, id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("listing a rented home again makes it available from the lease end")
    void publishCarriesTheLeaseEnd() throws Exception {
        User owner = user("9820008005", "owner", "Asha Patil");
        LocalDate end = LocalDate.now(PlatformTime.IST).plusDays(45);
        UUID id = home(owner, "E-1", end);

        mvc.perform(post(Routes.MeManagedProperties.BASE + "/" + id + "/publish")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject("""
                select p.available_on from properties p
                  join managed_properties m on m.published_listing_id = p.id
                 where m.id = ?
                """, LocalDate.class, id)).isEqualTo(end);
    }
}
