package com.draazy.api.services;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("GET /me/rent-agreements/{id}/renewal")
class RentAgreementRenewalPrefillTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;

    private User user(String mobile, String name, boolean verified) {
        User u = new User(mobile, "owner");
        u.setName(name);
        u.setMobileVerified(verified);
        return users.saveAndFlush(u);
    }

    private UUID request(User requester) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into service_requests (id, requester_id, type, team, status, details)
                values (?, ?, 'rent-agreement', 'rental', 'completed',
                    cast('{"_state":{"tenants":[{"name":"Ravi Kulkarni","mobile":"9830001001"}]}}' as jsonb))
                """, id, requester.getId());
        return id;
    }

    private UUID agreement(User owner, UUID requestId, String tenantMobile, String status) {
        Property p = new Property(owner, "Flat " + tenantMobile, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p = properties.saveAndFlush(p);
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into rent_agreements (id, property_id, owner_id, tenant_mobile, rent, deposit, status,
                    start_date, duration_months, service_request_id)
                values (?, ?, ?, ?, 25000, 75000, ?, date '2026-01-01', 11, ?)
                """, id, p.getId(), owner.getId(), tenantMobile, status, requestId);
        return id;
    }

    private ResultActions renewal(User caller, UUID id) throws Exception {
        return mvc.perform(get("/me/rent-agreements/" + id + "/renewal")
                .header(HttpHeaders.AUTHORIZATION, bearer(caller)));
    }

    @Test
    @DisplayName("the owner and the tenant by mobile both get the terms, the next start date and both parties")
    void ownerAndTenantSeeThePrefill() throws Exception {
        User owner = user("9830000001", "Asha Patil", true);
        User tenant = user("9830001001", "Ravi K", true);
        UUID request = request(owner);
        UUID id = agreement(owner, request, "9830001001", "registered");
        agreement(owner, request, "9830001002", "draft");

        for (User caller : new User[] {owner, tenant}) {
            renewal(caller, id)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.serviceRequestId").value(request.toString()))
                    .andExpect(jsonPath("$.rent").value(25000))
                    .andExpect(jsonPath("$.deposit").value(75000))
                    .andExpect(jsonPath("$.months").value(11))
                    .andExpect(jsonPath("$.startDate").value("2026-12-01"))
                    .andExpect(jsonPath("$.owner.name").value("Asha Patil"))
                    .andExpect(jsonPath("$.owner.mobile").value("9830000001"))
                    .andExpect(jsonPath("$.tenants.length()").value(1))
                    .andExpect(jsonPath("$.tenants[0].name").value("Ravi Kulkarni"))
                    .andExpect(jsonPath("$.tenants[0].mobile").value("9830001001"));
        }
    }

    @Test
    @DisplayName("an active agreement works too; a tenant name falls back to the account name")
    void activeAndNameFallback() throws Exception {
        User owner = user("9830000011", "Asha Patil", true);
        user("9830001011", "Meera Joshi", true);
        UUID id = agreement(owner, null, "9830001011", "active");

        renewal(owner, id)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.serviceRequestId").doesNotExist())
                .andExpect(jsonPath("$.tenants[0].name").value("Meera Joshi"));
    }

    @Test
    @DisplayName("a stranger, an unverified holder of the mobile and a draft all get 404")
    void everyoneElseGets404() throws Exception {
        User owner = user("9830000021", "Asha Patil", true);
        User stranger = user("9830000022", "Nosy", true);
        User unverified = user("9830001021", "Squatter", false);
        UUID registered = agreement(owner, null, "9830001021", "registered");
        UUID draft = agreement(owner, null, "9830001023", "draft");

        renewal(stranger, registered).andExpect(status().isNotFound());
        renewal(unverified, registered).andExpect(status().isNotFound());
        renewal(owner, draft).andExpect(status().isNotFound());
        renewal(owner, UUID.randomUUID()).andExpect(status().isNotFound());
    }
}
