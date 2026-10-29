package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import com.draazy.api.services.request.ServiceRequestStatus;
import com.draazy.api.services.request.ServiceRequestTypes;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Slice 11 — the exit from an unpaid service request, and the cap's floor")
class ServiceRequestUnpaidExitTest extends ServiceFixtures {
    private static final String CANCEL = Routes.ServiceRequests.BY_ID + "/cancel";

    @Nested
    @DisplayName("the customer cancels their own abandoned checkout (D152)")
    class SelfCancel {
        @AfterEach
        void clearAudit() {
            jdbc.update("delete from audit_log where action = 'service-request.cancelled-unpaid'");
        }

        @Test
        @DisplayName("the requester may cancel an unpaid request, and the timeline says why")
        void requesterCancelsTheirOwn() throws Exception {
            User buyer = customer("9820000901");
            String id = raiseUnpaid(buyer, listing(buyer));

            cancel(buyer, id, 200);

            expectStatus(buyer, id, ServiceRequestStatus.CANCELLED.wire());
            mvc.perform(get(Routes.ServiceRequests.BY_ID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.timeline[?(@.event=='payment.abandoned')]", hasSize(1)))
                    .andExpect(jsonPath("$.timeline[?(@.event=='payment.failed')]", hasSize(0)));
        }

        @Test
        @DisplayName("cancelling releases the desk — the whole point of D152")
        void cancellingReleasesTheCap() throws Exception {
            User buyer = customer("9820000902");
            Property p = listing(buyer);
            String first = raiseUnpaid(buyer, p);

            create(buyer, p, 409);

            cancel(buyer, first, 200);

            create(buyer, p, 201);
        }

        @Test
        @DisplayName("a staff caller is refused — they already have PATCH /status")
        void staffCannotUseTheCustomersDoor() throws Exception {
            User buyer = customer("9820000903");
            User desk = staff("9820000904", Teams.RENTAL);
            String id = raiseUnpaid(buyer, listing(buyer));

            cancel(desk, id, 403);
            expectStatus(buyer, id, ServiceRequestStatus.AWAITING_PAYMENT.wire());
        }

        @Test
        @DisplayName("a stranger gets 404, never 403 — the same rule as every other read")
        void aStrangersRequestIsInvisible() throws Exception {
            User buyer = customer("9820000905");
            User other = customer("9820000906");
            String id = raiseUnpaid(buyer, listing(buyer));

            cancel(other, id, 404);
        }

        @Test
        @DisplayName("a paid request cannot be cancelled here — status is the never-paid proof")
        void aPaidRequestIsRefused() throws Exception {
            User buyer = customer("9820000907");
            String id = raiseUnpaid(buyer, listing(buyer));
            deliverSigned(paymentRef(id), true);
            expectStatus(buyer, id, ServiceRequestStatus.NEW.wire());

            cancel(buyer, id, 409);
            expectStatus(buyer, id, ServiceRequestStatus.NEW.wire());
        }

        @Test
        @DisplayName("cancelling twice is a 409, not a second cancellation")
        void cancellingTwiceIsRefused() throws Exception {
            User buyer = customer("9820000908");
            String id = raiseUnpaid(buyer, listing(buyer));

            cancel(buyer, id, 200);
            cancel(buyer, id, 409);
        }
    }

    @Nested
    @DisplayName("the sweep closes checkouts nobody came back to (D152)")
    class ExpirySweep {
        @Test
        @DisplayName("an unpaid request past the TTL is cancelled, and the desk reopens")
        void staleCheckoutsAreCancelled() throws Exception {
            User buyer = customer("9820000910");
            Property p = listing(buyer);
            String id = raiseUnpaid(buyer, p);

            assertThat(serviceRequests.expireAbandonedCheckouts(future())).isEqualTo(1);

            expectStatus(buyer, id, ServiceRequestStatus.CANCELLED.wire());
            create(buyer, p, 201);
        }

        @Test
        @DisplayName("a checkout still inside its TTL is left alone")
        void freshCheckoutsSurvive() throws Exception {
            User buyer = customer("9820000911");
            String id = raiseUnpaid(buyer, listing(buyer));

            assertThat(serviceRequests.expireAbandonedCheckouts(past())).isZero();

            expectStatus(buyer, id, ServiceRequestStatus.AWAITING_PAYMENT.wire());
        }

        @Test
        @DisplayName("a paid request is never touched, however old it is")
        void paidRequestsAreUntouchable() throws Exception {
            User buyer = customer("9820000912");
            String id = raiseUnpaid(buyer, listing(buyer));
            deliverSigned(paymentRef(id), true);

            assertThat(serviceRequests.expireAbandonedCheckouts(future())).isZero();

            expectStatus(buyer, id, ServiceRequestStatus.NEW.wire());
        }

        @Test
        @DisplayName("a second pass over the same rows cancels nothing further")
        void theSweepIsIdempotent() throws Exception {
            User buyer = customer("9820000913");
            raiseUnpaid(buyer, listing(buyer));

            assertThat(serviceRequests.expireAbandonedCheckouts(future())).isEqualTo(1);
            assertThat(serviceRequests.expireAbandonedCheckouts(future())).isZero();
        }

        @Test
        @DisplayName("the checkout clock starts when checkout opens, not when the request was filed")
        void aLateCheckoutGetsItsFullTtl() throws Exception {
            User buyer = customer("9820000914");
            Property p = listing(buyer);
            create(buyer, p, 201);
            UUID id = openUnpaidId(buyer);
            jdbc.update("update service_requests set created_at = now() - interval '2 days' where id = ?", id);

            paymentRef(id.toString());

            assertThat(serviceRequests.expireAbandonedCheckouts(past())).isZero();
            expectStatus(buyer, id.toString(), ServiceRequestStatus.AWAITING_PAYMENT.wire());
        }

        @Test
        @DisplayName("a filing that never opened checkout is retired after its longer inactivity window")
        void incompleteFilingsExpireLater() throws Exception {
            User buyer = customer("9820000915");
            Property p = listing(buyer);
            create(buyer, p, 201);
            UUID id = openUnpaidId(buyer);

            assertThat(serviceRequests.expireAbandonedCheckouts(future())).isZero();
            assertThat(serviceRequests.expireAbandonedCheckouts(future().plus(Duration.ofDays(31))))
                    .isEqualTo(1);

            expectStatus(buyer, id.toString(), ServiceRequestStatus.CANCELLED.wire());
            create(buyer, p, 201);
        }

        private UUID openUnpaidId(User requester) {
            return jdbc.queryForObject("select id from service_requests where requester_id = ? "
                    + "and status = 'awaiting-payment'", UUID.class, requester.getId());
        }

        private Instant future() {
            return Instant.now().plus(Duration.ofMinutes(5));
        }

        private Instant past() {
            return Instant.now().minus(Duration.ofHours(1));
        }
    }

    @Nested
    @DisplayName("the unpaid-order cap has a floor in the database (D153)")
    class CapFloor {
        @Test
        @DisplayName("a second open unpaid row for the same requester and desk is refused")
        void theDatabaseRefusesTheSecondRow() throws Exception {
            User buyer = customer("9820000920");
            raiseUnpaid(buyer, listing(buyer));

            assertThatThrownBy(() -> insertOpenUnpaid(buyer, "rent-agreement"))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        @DisplayName("the index is scoped to one requester and one desk, and nothing wider")
        void theIndexIsNarrow() throws Exception {
            User buyer = customer("9820000921");
            User other = customer("9820000922");
            raiseUnpaid(buyer, listing(buyer));

            insertOpenUnpaid(other, "rent-agreement");
            insertOpenUnpaid(buyer, "legal");

            assertThat(openUnpaidCount(buyer)).isEqualTo(2);
            assertThat(openUnpaidCount(other)).isEqualTo(1);
        }

        @Test
        @DisplayName("a settled request leaves the index, so the next one is free to open")
        void settledRowsLeaveTheIndex() throws Exception {
            User buyer = customer("9820000923");
            Property p = listing(buyer);
            String first = raiseUnpaid(buyer, p);
            deliverSigned(paymentRef(first), true);

            create(buyer, p, 201);
            insertOpenUnpaid(buyer, "legal");
        }

        @Test
        @DisplayName("the ordinary double click is still refused by the count, not by the index")
        void theFastPathStillAnswersFirst() throws Exception {
            User buyer = customer("9820000924");
            Property p = listing(buyer);
            raiseUnpaid(buyer, p);

            create(buyer, p, 409);
            assertThat(openUnpaidCount(buyer)).isEqualTo(1);
        }

        private void insertOpenUnpaid(User requester, String type) {
            jdbc.update("insert into service_requests (requester_id, type, team, status) "
                    + "values (?, ?, ?, 'awaiting-payment')",
                    requester.getId(), type, ServiceRequestTypes.teamFor(type));
        }

        private int openUnpaidCount(User requester) {
            Integer count = jdbc.queryForObject(
                    "select count(*) from service_requests "
                            + "where status = 'awaiting-payment' and requester_id = ?",
                    Integer.class, requester.getId());
            return count == null ? 0 : count;
        }
    }

    @Nested
    @DisplayName("the cap's 409 describes something the customer can actually do (D152)")
    class CapMessage {
        @Test
        @DisplayName("it offers cancellation and expiry, not the two dead ends it used to")
        void theMessageNamesRealActions() throws Exception {
            User buyer = customer("9820000930");
            Property p = listing(buyer);
            raiseUnpaid(buyer, p);

            mvc.perform(post(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(createBody(p)))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.message", containsString("Cancel it")))
                    .andExpect(jsonPath("$.message", containsString("expired")))
                    .andExpect(jsonPath("$.message",
                            not(containsString("Pay for it or cancel it"))));
        }
    }

    private void cancel(User caller, String id, int expected) throws Exception {
        mvc.perform(post(CANCEL, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().is(expected));
    }

    private void create(User caller, Property property, int expected) throws Exception {
        mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createBody(property)))
                .andExpect(status().is(expected));
    }

    private static String createBody(Property property) {
        return "{\"type\":\"rent-agreement\",\"propertyId\":\"" + property.getId() + "\"}";
    }
}
