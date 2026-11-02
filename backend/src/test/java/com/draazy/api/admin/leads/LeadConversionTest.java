package com.draazy.api.admin.leads;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.identity.user.User;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Leads CRM conversions: credit follows a paid request, once")
class LeadConversionTest extends LeadsTestBase {
    private static final String CONVERTIBLE = LEADS + "/{id}/convertible";
    private static final String CONVERSIONS = LEADS + "/{id}/conversions";

    private UUID request(User buyer, String type, String status, int amount) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into service_requests (id, requester_id, type, team, status, details, amount)
                values (?, ?, ?, ?, ?, '{}'::jsonb, ?)
                """, id, buyer.getId(), type, type.equals("rent-agreement") ? "rental" : type, status, amount);
        return id;
    }

    private UUID leadFor(User buyer, User owner) {
        UUID id = lead(buyer.getMobile(), buyer.getName(), "interested", owner);
        jdbc.update("update crm_leads set user_id = ? where id = ?", buyer.getId(), id);
        return id;
    }

    private static String body(UUID requestId) {
        return "{\"serviceRequestId\":\"" + requestId + "\"}";
    }

    @Test
    @DisplayName("only paid, unconverted requests of the lead's own account are convertible")
    void convertibleList() throws Exception {
        User ravi = staff("9877300001", "Ravi");
        User buyer = user("9877300002", "buyer", "Meera");
        User other = user("9877300003", "buyer", "Other");
        UUID id = leadFor(buyer, ravi);
        UUID paid = request(buyer, "packers", "new", 4999);
        request(buyer, "legal", "awaiting-payment", 999);
        request(buyer, "interior", "cancelled", 999);
        request(other, "valuation", "new", 999);

        get(ravi, CONVERTIBLE, id).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].id").value(paid.toString()))
                .andExpect(jsonPath("$[0].type").value("packers"))
                .andExpect(jsonPath("$[0].amount").value(4999));

        UUID anonymous = lead("9877300004", "new", ravi);
        get(ravi, CONVERTIBLE, anonymous).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(0)));
    }

    @Test
    @DisplayName("the owner converts a paid request once and the lead becomes converted")
    void convertOnce() throws Exception {
        User ravi = staff("9877300005", "Ravi");
        User sneha = staff("9877300006", "Sneha");
        User buyer = user("9877300007", "buyer", "Meera");
        UUID id = leadFor(buyer, ravi);
        UUID paid = request(buyer, "packers", "new", 4999);
        UUID unpaid = request(buyer, "legal", "awaiting-payment", 999);

        post(sneha, CONVERSIONS, body(paid), id).andExpect(status().isForbidden());
        post(ravi, CONVERSIONS, body(unpaid), id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-conversion-invalid"));
        post(ravi, CONVERSIONS, body(UUID.randomUUID()), id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-conversion-invalid"));
        post(ravi, CONVERSIONS, body(paid), id).andExpect(status().isOk())
                .andExpect(jsonPath("$.stage").value("converted"))
                .andExpect(jsonPath("$.conversions[0].creditedToId").value(ravi.getId().toString()))
                .andExpect(jsonPath("$.conversions[0].amount").value(4999))
                .andExpect(jsonPath("$.conversions[0].service").value("packers"));
        post(ravi, CONVERSIONS, body(paid), id).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("lead-conversion-invalid"));

        UUID second = lead("9877300008", "interested", ravi);
        jdbc.update("update crm_leads set user_id = ? where id = ?", buyer.getId(), second);
        post(ravi, CONVERSIONS, body(paid), second).andExpect(status().isConflict());
        assertThat(count("select count(*) from crm_lead_conversions where service_request_id = ?", paid))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("a manager can move the credit to another active staff member; staff cannot")
    void creditOverride() throws Exception {
        User ravi = staff("9877300009", "Ravi");
        User sneha = staff("9877300010", "Sneha");
        User boss = manager("9877300011", "Boss");
        User buyer = user("9877300012", "buyer", "Meera");
        UUID id = leadFor(buyer, ravi);
        post(ravi, CONVERSIONS, body(request(buyer, "packers", "new", 4999)), id).andExpect(status().isOk());
        UUID conversion = jdbc.queryForObject("select id from crm_lead_conversions where lead_id = ?", UUID.class,
                id);
        String credit = "{\"creditedTo\":\"" + sneha.getId() + "\"}";

        patch(ravi, LEADS + "/conversions/{id}", credit, conversion).andExpect(status().isForbidden());
        patch(boss, LEADS + "/conversions/{id}", "{\"creditedTo\":\"" + UUID.randomUUID() + "\"}", conversion)
                .andExpect(status().isBadRequest());
        patch(boss, LEADS + "/conversions/{id}", credit, UUID.randomUUID()).andExpect(status().isNotFound());
        patch(boss, LEADS + "/conversions/{id}", credit, conversion).andExpect(status().isOk())
                .andExpect(jsonPath("$.creditedToId").value(sneha.getId().toString()))
                .andExpect(jsonPath("$.creditedToName").value("Sneha"));
    }
}
