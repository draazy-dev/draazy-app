package com.draazy.api.admin.leads;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.identity.user.User;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Leads CRM access: masked lists, audited full number on detail, manager-only views and performance")
class LeadAccessTest extends LeadsTestBase {
    private static final String PERFORMANCE = LEADS + "/performance";

    @Test
    @DisplayName("lists stay masked; anyone with leads access sees the full number on detail, audited and logged once a day")
    void fullNumberOnDetail() throws Exception {
        User ravi = staff("9877400001", "Ravi");
        User sneha = staff("9877400010", "Sneha");
        UUID id = lead("9877400002", "Meera", "new", ravi);

        get(ravi, LEADS + "?view=mine").andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].maskedMobile").value(MobileMask.mask("9877400002")))
                .andExpect(content().string(not(containsString("9877400002"))));
        get(sneha, LEADS + "/{id}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.mobile").value("9877400002"));
        get(sneha, LEADS + "/{id}", id).andExpect(status().isOk());

        assertThat(count("select count(*) from audit_log where action = 'lead.reveal' and entity_id = ?",
                id.toString())).isEqualTo(2);
        assertThat(count("select count(*) from crm_lead_activities where lead_id = ? and kind = 'reveal' "
                + "and actor_id = ?", id, sneha.getId())).isEqualTo(1);
    }

    @Test
    @DisplayName("a do-not-call number is never shown or audited")
    void doNotCallStaysMasked() throws Exception {
        User ravi = staff("9877400003", "Ravi");
        UUID id = lead("9877400004", "do-not-call", ravi);

        get(ravi, LEADS + "/{id}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.mobile").value(nullValue()))
                .andExpect(jsonPath("$.maskedMobile").value(MobileMask.mask("9877400004")));
        assertThat(count("select count(*) from audit_log where action = 'lead.reveal' and entity_id = ?",
                id.toString())).isZero();
    }

    @Test
    @DisplayName("mine puts due leads first; the pool hides closed ones; counts ride on every page")
    void listsAndCounts() throws Exception {
        User ravi = staff("9877400005", "Ravi");
        UUID later = lead("9877400006", "Later", "contacted", ravi);
        UUID due = lead("9877400007", "Due", "contacted", ravi);
        UUID fresh = lead("9877400008", "Fresh", "new", ravi);
        lead("9877400009", "Done", "lost", ravi);
        jdbc.update("update crm_leads set next_follow_up_at = now() + interval '2 days', "
                + "last_contact_at = now() - interval '3 days' where id = ?", later);
        jdbc.update("update crm_leads set next_follow_up_at = now() - interval '1 hour', "
                + "last_contact_at = now() - interval '3 days' where id = ?", due);
        lead("9877400010", "Open A", "new", null);
        lead("9877400011", "Closed", "do-not-call", null);
        lead("9877400012", "Won", "converted", null);

        get(ravi, LEADS + "?view=mine").andExpect(status().isOk())
                .andExpect(jsonPath("$.content[*].id", contains(due.toString(), fresh.toString(), later.toString(),
                        jdbc.queryForObject("select id::text from crm_leads where mobile = '9877400009'",
                                String.class))))
                .andExpect(jsonPath("$.content[0].due").value(true))
                .andExpect(jsonPath("$.content[0].mine").value(true))
                .andExpect(jsonPath("$.counts.mine").value(3))
                .andExpect(jsonPath("$.counts.due").value(2))
                .andExpect(jsonPath("$.counts.pool").value(1));
        get(ravi, LEADS + "?view=pool").andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.content[0].name").value("Open A"))
                .andExpect(jsonPath("$.content[0].consent").value("service-only"));
    }

    @Test
    @DisplayName("a lead of an opted-in user shows opted-in consent")
    void consentShown() throws Exception {
        User ravi = staff("9877400013", "Ravi");
        User buyer = user("9877400014", "buyer", "Meera");
        jdbc.update("insert into notification_preferences (user_id, marketing_consent_at) values (?, now()) "
                + "on conflict (user_id) do update set marketing_consent_at = now()", buyer.getId());
        UUID id = lead("9877400014", "Meera", "new", ravi);
        jdbc.update("update crm_leads set user_id = ? where id = ?", buyer.getId(), id);

        get(ravi, LEADS + "?view=mine").andExpect(jsonPath("$.content[0].consent").value("opted-in"));
    }

    @Test
    @DisplayName("buyers, owners and staff without the leads function are refused")
    void roleGate() throws Exception {
        User buyer = user("9877400015", "buyer", "Buyer");
        User owner = user("9877400016", "owner", "Owner");
        User narrow = staff("9877400017", "Narrow");
        jdbc.update("insert into back_office_permissions (user_id, permissions) values (?, '[]'::jsonb)",
                narrow.getId());

        for (User refused : new User[] {buyer, owner, narrow}) {
            get(refused, LEADS + "?view=mine").andExpect(status().isForbidden());
        }
    }

    @Test
    @DisplayName("view=all, assignees, performance, assign and credit override are manager-only")
    void managerOnly() throws Exception {
        User ravi = staff("9877400018", "Ravi");
        User boss = manager("9877400019", "Boss");
        UUID id = lead("9877400020", "new", null);

        get(ravi, LEADS + "?view=all").andExpect(status().isForbidden());
        get(ravi, LEADS + "/assignees").andExpect(status().isForbidden());
        get(ravi, PERFORMANCE).andExpect(status().isForbidden());
        post(ravi, LEADS + "/{id}/assign", "{\"staffId\":\"" + ravi.getId() + "\"}", id)
                .andExpect(status().isForbidden());

        get(boss, LEADS + "?view=all&stage=new").andExpect(status().isOk());
        get(boss, LEADS + "/assignees").andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.name=='Ravi')].openLeads").value(0));
        get(boss, PERFORMANCE + "?days=14").andExpect(status().isBadRequest());
        get(boss, PERFORMANCE).andExpect(status().isOk()).andExpect(jsonPath("$.days").value(30));
    }

    @Test
    @DisplayName("performance counts claims, contacts, first-contact time, conversions and revenue per staff member")
    void performance() throws Exception {
        User ravi = staff("9877400021", "Ravi");
        User sneha = staff("9877400022", "Sneha");
        User boss = manager("9877400023", "Boss");
        User buyer = user("9877400024", "buyer", "Meera");
        UUID won = lead("9877400025", "Won", "contacted", ravi);
        UUID second = lead("9877400026", "Second", "contacted", ravi);
        lead("9877400027", "Theirs", "new", sneha);
        jdbc.update("update crm_leads set claimed_at = now() - interval '1 day', user_id = ? where id = ?",
                buyer.getId(), won);
        jdbc.update("update crm_leads set claimed_at = now() - interval '1 day' where owner_id = ?", sneha.getId());
        jdbc.update("update crm_leads set claimed_at = now() - interval '1 day' where id = ?", second);
        activity(won, ravi, "claim", "10 hours");
        activity(second, ravi, "claim", "8 hours");
        activity(won, ravi, "call", "5 hours");
        activity(won, ravi, "whatsapp", "1 hour");
        activity(second, ravi, "call", "2 hours");
        UUID paid = UUID.randomUUID();
        jdbc.update("insert into service_requests (id, requester_id, type, team, status, details, amount) "
                + "values (?, ?, 'packers', 'packers', 'new', '{}'::jsonb, 4999)", paid, buyer.getId());
        post(ravi, LEADS + "/{id}/conversions", "{\"serviceRequestId\":\"" + paid + "\"}", won)
                .andExpect(status().isOk());

        get(boss, PERFORMANCE + "?days=7").andExpect(status().isOk())
                .andExpect(jsonPath("$.days").value(7))
                .andExpect(jsonPath("$.rows[0].staffName").value("Ravi"))
                .andExpect(jsonPath("$.rows[0].openLeads").value(1))
                .andExpect(jsonPath("$.rows[0].claimed").value(2))
                .andExpect(jsonPath("$.rows[0].contacted").value(2))
                .andExpect(jsonPath("$.rows[0].attempts").value(3))
                .andExpect(jsonPath("$.rows[0].avgFirstContactHours").value(5.5))
                .andExpect(jsonPath("$.rows[0].conversions").value(1))
                .andExpect(jsonPath("$.rows[0].revenue").value(4999))
                .andExpect(jsonPath("$.rows[0].conversionRate").value(50.0))
                .andExpect(jsonPath("$.rows[1].staffName").value("Sneha"))
                .andExpect(jsonPath("$.rows[1].claimed").value(1))
                .andExpect(jsonPath("$.rows[1].conversionRate").value(0.0))
                .andExpect(jsonPath("$.totals.claimed").value(3))
                .andExpect(jsonPath("$.totals.attempts").value(3))
                .andExpect(jsonPath("$.totals.conversions").value(1))
                .andExpect(jsonPath("$.totals.revenue").value(4999))
                .andExpect(jsonPath("$.totals.conversionRate").value(33.3))
                .andExpect(jsonPath("$.totals.staffId").doesNotExist());
    }

    private void activity(UUID lead, User actor, String kind, String ago) {
        jdbc.update("insert into crm_lead_activities (lead_id, actor_id, kind, created_at) "
                + "values (?, ?, ?, now() - cast(? as interval))", lead, actor.getId(), kind, ago);
    }
}
