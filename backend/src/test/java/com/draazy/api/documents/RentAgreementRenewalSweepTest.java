package com.draazy.api.documents;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.agreement.RentAgreementRenewalSweeper;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("Rent agreement renewal reminders")
class RentAgreementRenewalSweepTest extends AbstractApiTest {

    // 09:30 IST on 11 Oct 2026, so the window is 11 Oct .. 10 Dec inclusive.
    private static final Instant NOW = Instant.parse("2026-10-11T04:00:00Z");

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired RentAgreementRenewalSweeper sweeper;

    private User user(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Asha Patil");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "Flat " + owner.getMobile(), "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private UUID request(User requester) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into service_requests (id, requester_id, type, team, status)"
                + " values (?, ?, 'rent-agreement', 'rental', 'new')", id, requester.getId());
        return id;
    }

    private UUID agreement(User owner, String tenantMobile, String start, int months, String status, UUID requestId) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into rent_agreements (id, property_id, owner_id, tenant_mobile, rent, status, start_date,
                    duration_months, service_request_id)
                values (?, ?, ?, ?, 25000, ?, cast(? as date), ?, ?)
                """, id, listing(owner).getId(), owner.getId(), tenantMobile, status, start, months, requestId);
        return id;
    }

    private List<Map<String, Object>> notes(User user) {
        return jdbc.queryForList("select type, title, body, link from notifications where user_id = ? order by id",
                user.getId());
    }

    private boolean reminded(UUID agreementId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select renewal_reminded_at is not null from rent_agreements where id = ?", Boolean.class, agreementId));
    }

    @Test
    @DisplayName("only terms ending from today to sixty days out, in registered or active, are reminded")
    void windowAndStatusEdges() {
        User owner = user("9820007001");
        UUID today = agreement(owner, "9820007101", "2025-11-12", 11, "registered", null);
        UUID lastDay = agreement(owner, "9820007102", "2026-01-11", 11, "active", null);
        UUID yesterday = agreement(owner, "9820007103", "2025-11-11", 11, "registered", null);
        UUID tooFar = agreement(owner, "9820007104", "2026-01-12", 11, "registered", null);
        UUID draft = agreement(owner, "9820007105", "2026-01-01", 11, "draft", null);
        UUID expired = agreement(owner, "9820007106", "2026-01-01", 11, "expired", null);

        assertThat(sweeper.remindEnding(NOW)).isEqualTo(2);

        assertThat(List.of(today, lastDay)).allMatch(this::reminded);
        assertThat(List.of(yesterday, tooFar, draft, expired)).noneMatch(this::reminded);
    }

    @Test
    @DisplayName("one owner notification per request, tenants found by mobile, and a second run sends nothing")
    void groupsByRequestAndIsIdempotent() {
        User owner = user("9820007011");
        User tenantOne = user("9820007012");
        User tenantTwo = user("9820007013");
        UUID request = request(owner);
        UUID rowOne = agreement(owner, "9820007012", "2026-01-01", 11, "registered", request);
        UUID rowTwo = agreement(owner, "9820007013", "2026-01-01", 11, "registered", request);
        agreement(owner, "9820007099", "2026-01-01", 11, "registered", request);

        assertThat(sweeper.remindEnding(NOW)).isEqualTo(1);

        List<Map<String, Object>> ownerNotes = notes(owner);
        assertThat(ownerNotes).hasSize(1);
        assertThat(ownerNotes.get(0)).containsEntry("type", "agreement.renewal")
                .containsEntry("title", "Your rent agreement ends on 30 Nov 2026")
                .containsEntry("link", "/dashboard#documents");
        assertThat((String) ownerNotes.get(0).get("body")).contains("\u20b9499").contains("1 Dec 2026");
        assertThat(notes(tenantOne)).singleElement()
                .satisfies(n -> assertThat(n).containsEntry("link", "/dashboard#rental")
                        .containsEntry("title", "Your rent agreement ends on 30 Nov 2026"));
        assertThat(notes(tenantTwo)).hasSize(1);
        assertThat(reminded(rowOne) && reminded(rowTwo)).isTrue();

        assertThat(sweeper.remindEnding(NOW)).isZero();
        assertThat(notes(owner)).hasSize(1);
        assertThat(notes(tenantOne)).hasSize(1);
    }

    @Test
    @DisplayName("GET /me/rent-agreements carries the service request and the derived end date")
    void dtoCarriesRequestAndEndDate() throws Exception {
        User owner = user("9820007021");
        UUID request = request(owner);
        agreement(owner, "9820007121", "2026-01-01", 11, "registered", request);
        agreement(owner, "9820007122", null, 11, "draft", null);

        mvc.perform(get(Routes.MeRentAgreements.BASE).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[?(@.status=='registered')].serviceRequestId").value(request.toString()))
                .andExpect(jsonPath("$[?(@.status=='registered')].endDate").value("2026-11-30"));
    }
}
