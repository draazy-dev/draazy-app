package com.draazy.api.billing.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.draazy.api.billing.plan.Subscription;
import com.draazy.api.billing.plan.TestPlanGrants;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.support.AbstractCommittedApiTest;
import com.draazy.api.support.Races;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Refund races: one decision per request, and a refund request against a contact spend")
class RefundRacesTest extends AbstractCommittedApiTest {

    @Autowired PropertyRepository properties;
    @Autowired ContactRequestRepository contactRequests;
    @Autowired TestPlanGrants grants;

    @Override
    protected String mobilePrefix() {
        return "97913400";
    }

    private Property listing(User owner, String title) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private Subscription freshPack(User buyer) {
        Instant now = Instant.now();
        Subscription pack = grants.grantPack(buyer.getId(), now, now.plus(30, ChronoUnit.DAYS));
        jdbc.update("update subscriptions set payment_ref = ? where id = ?", "dz_race_" + UUID.randomUUID(), pack.getId());
        return pack;
    }

    private int send(String path, User caller, String body, Object... vars) {
        try {
            return mvc.perform(post(path, vars).header(HttpHeaders.AUTHORIZATION, bearer(caller))
                            .header("Idempotency-Key", UUID.randomUUID().toString())
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andReturn().getResponse().getStatus();
        } catch (Exception thrown) {
            throw new IllegalStateException(thrown);
        }
    }

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    @Test
    @DisplayName("two staff approving the same request at once: one decision, one refund due, one audit row")
    void concurrentApprovalsDecideOnce() {
        User buyer = user("01", "buyer");
        User staff = user("02", "admin");
        User otherStaff = user("03", "admin");
        Subscription pack = freshPack(buyer);
        assertThat(send(Routes.Refunds.MY_REFUND, buyer, "{\"reason\":\"not needed\"}", pack.getId())).isEqualTo(200);
        UUID requestId = jdbc.queryForObject("select id from refund_requests where subscription_id = ?",
                UUID.class, pack.getId());
        List<Integer> outcomes = Collections.synchronizedList(new ArrayList<>());

        Races.run(2, i -> outcomes.add(send(Routes.Refunds.APPROVE, i == 0 ? staff : otherStaff, "{}", requestId)));

        assertThat(outcomes).as("outcomes=" + outcomes).containsExactlyInAnyOrder(200, 409);
        assertThat(count("select count(*) from audit_log where entity_id = ? and action = 'refund.approved'",
                requestId.toString())).isEqualTo(1L);
        assertThat(count("select count(*) from subscriptions where id = ? and refund_due_at is not null",
                pack.getId())).isEqualTo(1L);
        assertThat(jdbc.queryForObject("select status from refund_requests where id = ?", String.class, requestId))
                .isEqualTo("approved");
    }

    @Test
    @DisplayName("a refund request racing the contact that spends the pack leaves one consistent outcome")
    void refundRequestAgainstAContactSpend() {
        User buyer = user("04", "buyer");
        User owner = user("05", "owner");
        for (int i = 0; i < 15; i++) {
            contactRequests.saveAndFlush(new ContactRequest(listing(owner, "Used " + i).getId(), buyer.getId(), null));
        }
        jdbc.update("update contact_requests set status = 'approved' where requester_id = ?", buyer.getId());
        Subscription pack = freshPack(buyer);
        Property target = listing(owner, "Target");
        int[] outcome = new int[2];

        Races.run(2, i -> {
            if (i == 0) {
                outcome[0] = send(Routes.Refunds.MY_REFUND, buyer, "{\"reason\":\"not needed\"}", pack.getId());
            } else {
                outcome[1] = send(Routes.Contacts.REQUEST, buyer, "{\"propertyId\":\"" + target.getId() + "\"}");
            }
        });

        long rows = count("select count(*) from contact_requests where requester_id = ?", buyer.getId());
        long requests = count("select count(*) from refund_requests where subscription_id = ?", pack.getId());
        String outcomes = "refund=" + outcome[0] + " contact=" + outcome[1];
        if (outcome[0] == 200) {
            assertThat(outcome[1]).as(outcomes).isEqualTo(422);
            assertThat(rows).as(outcomes).isEqualTo(15L);
            assertThat(requests).isEqualTo(1L);
        } else {
            assertThat(outcome[0]).as(outcomes).isEqualTo(422);
            assertThat(outcome[1]).as(outcomes).isEqualTo(200);
            assertThat(rows).as(outcomes).isEqualTo(16L);
            assertThat(requests).isZero();
        }
    }
}