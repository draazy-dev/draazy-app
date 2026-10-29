package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import com.draazy.api.services.request.ServiceRequestTypes;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;

@DisplayName("Service requests — team scoping and the ticket link (D44, D45)")
class ServiceRequestTeamScopingTest extends ServiceFixtures {
    @Autowired
    private JdbcTemplate jdbc;

    @Nested
    @DisplayName("the type→desk map")
    class Routing {
        @Test
        @DisplayName("every service type names the desk that works it")
        void everyTypeHasADesk() {
            assertThat(ServiceRequestTypes.teams().keySet())
                    .as("a type with no desk would belong to nobody and vanish from every queue")
                    .isEqualTo(ServiceRequestTypes.known());
            assertThat(ServiceRequestTypes.teams().values())
                    .as("every desk named must be a real team")
                    .allSatisfy(team -> assertThat(Teams.isKnown(team)).isTrue());
        }

        @Test
        @DisplayName("the priced rent-agreement desk is worked by the rental team, not a 'rent' one")
        void rentAgreementIsWorkedByRental() {
            assertThat(ServiceRequestTypes.teamFor(ServiceRequestTypes.RENT_AGREEMENT))
                    .isEqualTo(Teams.RENTAL);
        }

        @Test
        @DisplayName("an unmapped type throws rather than landing on a default desk")
        void unmappedTypeFailsLoudly() {
            assertThatThrownBy(() -> ServiceRequestTypes.teamFor("conveyancing"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("conveyancing");
        }

        @Test
        @DisplayName("the database refuses a request filed onto the wrong desk")
        void theDatabaseHoldsThePairing() {
            User buyer = customer("9820000401");

            assertThatThrownBy(() -> jdbc.update(
                    "insert into service_requests (requester_id, type, team, status) "
                            + "values (?, 'rent-agreement', 'packers', 'new')", buyer.getId()))
                    .isInstanceOf(DataIntegrityViolationException.class);
        }

        @Test
        @DisplayName("a request is stamped with its desk at creation and reports it on the wire")
        void theDeskIsOnTheResponse() throws Exception {
            User buyer = customer("9820000402");
            String id = raise(buyer, "valuation", null);

            mvc.perform(get(Routes.ServiceRequests.BY_ID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.team").value(Teams.VALUATION));
        }
    }

    @Nested
    @DisplayName("the ops queue is scoped by desk")
    class Scoping {
        @Test
        @DisplayName("an ops user of one desk cannot see another desk's requests")
        void oneDeskDoesNotSeeAnother() throws Exception {
            User buyer = customer("9820000410");
            raise(buyer, "rent-agreement", listing(buyer));
            raise(buyer, "legal", null);

            User legal = staff("9820000411", Teams.LEGAL);
            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(legal)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content", hasSize(1)))
                    .andExpect(jsonPath("$.content[0].type").value("legal"));

            User rental = staff("9820000412", Teams.RENTAL);
            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(rental)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content", hasSize(1)))
                    .andExpect(jsonPath("$.content[0].type").value("rent-agreement"));
        }

        @Test
        @DisplayName("reading another desk's request by id is a 403, not a 404")
        void crossDeskReadIsForbidden() throws Exception {
            User buyer = customer("9820000413");
            String id = raise(buyer, "rent-agreement", listing(buyer));
            User legal = staff("9820000414", Teams.LEGAL);

            mvc.perform(get(Routes.ServiceRequests.BY_ID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(legal)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("another desk cannot work the request either")
        void crossDeskWritesAreRefused() throws Exception {
            User buyer = customer("9820000415");
            String id = raise(buyer, "rent-agreement", listing(buyer));
            User legal = staff("9820000416", Teams.LEGAL);

            setStatus(legal, id, "assigned", 403);
            shareDraft(legal, id, 403);
            finalDoc(legal, id, 403);
        }

        @Test
        @DisplayName("a staff account with no desk sees nothing, not everything")
        void desklessStaffSeeNothing() throws Exception {
            User buyer = customer("9820000417");
            raise(buyer, "rent-agreement", listing(buyer));
            User nobody = staff("9820000418", null);

            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(nobody)))
                    .andExpect(status().isForbidden());
        }

        @Test
        @DisplayName("an admin sees every desk, and may narrow to one")
        void adminSeesEverything() throws Exception {
            User buyer = customer("9820000419");
            raise(buyer, "rent-agreement", listing(buyer));
            raise(buyer, "legal", null);
            User boss = admin("9820000420");

            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(boss)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content", hasSize(2)));

            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(boss))
                            .param("team", Teams.LEGAL))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content", hasSize(1)))
                    .andExpect(jsonPath("$.content[0].team").value(Teams.LEGAL));
        }

        @Test
        @DisplayName("naming somebody else's desk is refused rather than quietly substituted")
        void staffCannotFilterOntoAnotherDesk() throws Exception {
            User rental = staff("9820000421", Teams.RENTAL);

            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(rental))
                            .param("team", Teams.LEGAL))
                    .andExpect(status().isForbidden());
            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(rental))
                            .param("team", "conveyancing"))
                    .andExpect(status().isBadRequest());
        }

        @Test
        @DisplayName("a customer's own list is untouched by any of this")
        void customersAreUnaffected() throws Exception {
            User buyer = customer("9820000422");
            raise(buyer, "rent-agreement", listing(buyer));
            raise(buyer, "legal", null);

            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                            .param("team", Teams.LEGAL))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content", hasSize(2)));
        }
    }

    @Nested
    @DisplayName("the ticket link")
    class TicketLink {
        @Test
        @DisplayName("the link resolves from the request to the ticket and back again")
        void resolvesBothWays() throws Exception {
            User buyer = customer("9820000430");
            String ticketId = raiseTicket(buyer, "Opinion on the title, please", Teams.LEGAL);
            String requestId = raiseAgainstTicket(buyer, "legal", ticketId, 201);

            mvc.perform(get(Routes.ServiceRequests.BY_ID, requestId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.ticketId").value(ticketId));

            mvc.perform(get(Routes.ServiceRequests.BASE)
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff("9820000431", Teams.LEGAL)))
                            .param("ticketId", ticketId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content", hasSize(1)))
                    .andExpect(jsonPath("$.content[0].id").value(requestId));
        }

        @Test
        @DisplayName("a request with no ticket reports none rather than inventing one")
        void unlinkedRequestsSaySo() throws Exception {
            User buyer = customer("9820000432");
            String id = raise(buyer, "legal", null);

            mvc.perform(get(Routes.ServiceRequests.BY_ID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.ticketId").value(nullValue()));
        }

        @Test
        @DisplayName("a stranger's ticket cannot be claimed as the origin of my request")
        void cannotLinkToSomebodyElsesTicket() throws Exception {
            User mine = customer("9820000433");
            User theirs = customer("9820000434");
            String theirTicket = raiseTicket(theirs, "My own enquiry", Teams.LEGAL);

            raiseAgainstTicket(mine, "legal", theirTicket, 404);
            raiseAgainstTicket(mine, "legal", UUID.randomUUID().toString(), 404);
        }

        @Test
        @DisplayName("one ticket carries at most one request")
        void oneTicketOneRequest() throws Exception {
            User buyer = customer("9820000435");
            String ticketId = raiseTicket(buyer, "Legal opinion on the title", Teams.LEGAL);
            raiseAgainstTicket(buyer, "legal", ticketId, 201);

            raiseAgainstTicket(buyer, "legal", ticketId, 409);
        }
    }

    private String raiseTicket(User caller, String subject, String team) throws Exception {
        String json = mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("subject", subject, "team", team))))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(json, "id");
    }

    private String raiseAgainstTicket(User caller, String type, String ticketId, int expected)
            throws Exception {
        String json = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(Map.of("type", type, "ticketId", ticketId))))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
        return expected == 201 ? field(json, "id") : null;
    }

    private static String body(Map<String, String> fields) {
        return fields.entrySet().stream()
                .map(e -> "\"" + e.getKey() + "\":\"" + e.getValue() + "\"")
                .reduce((a, b) -> a + "," + b)
                .map(joined -> "{" + joined + "}")
                .orElse("{}");
    }
}
