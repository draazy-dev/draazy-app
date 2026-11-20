package com.draazy.api.services.ticket;

import com.draazy.api.support.AbstractApiTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class ServiceWaitlistTest extends AbstractApiTest {
    @Autowired UserRepository users;
    @Autowired TicketRepository tickets;

    private static final String SUBJECT = "Move-in Pack \u2014 waitlist";

    private static String body(String service, String name, String mobile) {
        return "{\"service\":\"" + service + "\",\"name\":\"" + name + "\",\"mobile\":\""
                + mobile + "\"}";
    }

    private void join(String mobile) throws Exception {
        joinWith(body(ServiceWaitlists.MOVE_IN_PACK, "Aarti Kale", mobile));
    }

    private void joinWith(String json) throws Exception {
        mvc.perform(post(Routes.ServiceWaitlist.BASE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json))
                .andExpect(status().isCreated());
    }

    private List<Ticket> rowsFor(String mobile) {
        return tickets.findAll().stream().filter(t -> mobile.equals(t.getMobile())).toList();
    }

    private String bearer(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Waitlist " + mobile.substring(6));
        u.setMobileVerified(true);
        return "Bearer " + jwtService.issueAccessToken(users.saveAndFlush(u));
    }

    @Test
    void aStrangerMayJoinWithoutSigningIn() throws Exception {
        String mobile = "9812400001";
        join(mobile);

        List<Ticket> rows = rowsFor(mobile);
        assertThat(rows).hasSize(1);
        Ticket t = rows.get(0);
        assertThat(t.getTeam()).isEqualTo(Teams.PACKERS);
        assertThat(t.getSubject()).isEqualTo(SUBJECT);
        assertThat(t.getStatus()).isEqualTo(TicketStatuses.OPEN);
        assertThat(t.getPriority()).isEqualTo(TicketPriorities.MEDIUM);
        assertThat(t.getCustomer()).isEqualTo("Aarti Kale");
        assertThat(t.getMobile()).isEqualTo(mobile);
    }

    @Test
    void theRowNamesNobodyBecauseNobodyProvedWhoTheyWere() throws Exception {
        String mobile = "9812400002";
        bearer(mobile, Roles.Wire.BUYER);

        join(mobile);

        assertThat(rowsFor(mobile)).singleElement()
                .satisfies(t -> assertThat(t.getRequesterId()).isNull());
    }

    @Test
    void aMissingNameBecomesAPlaceholderRatherThanABlankRow() throws Exception {
        String mobile = "9812400003";
        joinWith("{\"service\":\"" + ServiceWaitlists.MOVE_IN_PACK + "\",\"mobile\":\"" + mobile + "\"}");

        assertThat(rowsFor(mobile)).singleElement()
                .satisfies(t -> assertThat(t.getCustomer()).isEqualTo("Waitlist lead"));
    }

    @Test
    void theCallerCannotChooseTheDeskTheSubjectOrThePriority() throws Exception {
        String mobile = "9812400004";
        joinWith("{\"service\":\"" + ServiceWaitlists.MOVE_IN_PACK + "\",\"name\":\"Injector\","
                + "\"mobile\":\"" + mobile + "\",\"team\":\"legal\",\"priority\":\"urgent\","
                + "\"subject\":\"URGENT: call me\",\"quotedValue\":900000,\"status\":\"resolved\","
                + "\"detail\":\"click here\"}");

        assertThat(rowsFor(mobile)).singleElement().satisfies(t -> {
            assertThat(t.getTeam()).isEqualTo(Teams.PACKERS);
            assertThat(t.getSubject()).isEqualTo(SUBJECT);
            assertThat(t.getPriority()).isEqualTo(TicketPriorities.MEDIUM);
            assertThat(t.getStatus()).isEqualTo(TicketStatuses.OPEN);
            assertThat(t.getQuotedValue()).isNull();
            assertThat(t.getDetail()).isNull();
        });
    }

    @Test
    void anUnknownServiceIsRefused() throws Exception {
        mvc.perform(post(Routes.ServiceWaitlist.BASE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("free-money", "Nobody", "9812400005")))
                .andExpect(status().isBadRequest());

        assertThat(rowsFor("9812400005")).isEmpty();
    }

    @Test
    void aMalformedMobileIsRefused() throws Exception {
        mvc.perform(post(Routes.ServiceWaitlist.BASE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(ServiceWaitlists.MOVE_IN_PACK, "Nobody", "12345")))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void askingTwiceLeavesOneRowOnTheBoard() throws Exception {
        String mobile = "9812400006";
        join(mobile);
        join(mobile);

        assertThat(rowsFor(mobile)).hasSize(1);
    }

    @Test
    void aSignupTheDeskHasClosedDoesNotSilenceTheNextOne() throws Exception {
        String mobile = "9812400007";
        join(mobile);
        Ticket first = rowsFor(mobile).get(0);
        first.setStatus(TicketStatuses.CLOSED);
        tickets.flush();

        join(mobile);

        assertThat(rowsFor(mobile)).hasSize(2);
    }

    @Test
    void theBudgetCountsEveryTicketThatNumberHasRaised() throws Exception {
        String mobile = "9812400008";
        String token = bearer(mobile, Roles.Wire.BUYER);
        for (int i = 1; i <= 3; i++) {
            mvc.perform(post(Routes.Tickets.BASE)
                            .header(HttpHeaders.AUTHORIZATION, token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"subject\":\"Existing " + i + "\",\"team\":\"rental\"}"))
                    .andExpect(status().isCreated());
        }

        mvc.perform(post(Routes.ServiceWaitlist.BASE)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(ServiceWaitlists.MOVE_IN_PACK, "Noisy", mobile)))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.error").value("rate_limited"));
    }

    @Test
    void theBudgetIsPerNumber() throws Exception {
        String noisy = "9812400009";
        String token = bearer(noisy, Roles.Wire.BUYER);
        for (int i = 1; i <= 3; i++) {
            mvc.perform(post(Routes.Tickets.BASE)
                            .header(HttpHeaders.AUTHORIZATION, token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"subject\":\"Noise " + i + "\"}"))
                    .andExpect(status().isCreated());
        }

        join("9812400010");

        assertThat(rowsFor("9812400010")).hasSize(1);
    }

    @Test
    void theLeadIsVisibleToTheDeskThatOwnsIt() throws Exception {
        String mobile = "9812400011";
        join(mobile);

        User staff = new User("9877730050", Roles.Wire.STAFF);
        staff.setName("Packers Desk");
        staff.setMobileVerified(true);
        staff.setTeam(Teams.PACKERS);

        User saved = users.saveAndFlush(staff);
        jdbc.update("""
                INSERT INTO back_office_permissions (user_id, permissions)
                VALUES (?::uuid, ?::jsonb)
                ON CONFLICT (user_id) DO UPDATE SET permissions = EXCLUDED.permissions
                """, saved.getId().toString(), "[\"support\",\"desk:packers\"]");

        mvc.perform(get(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION,
                                "Bearer " + jwtService.issueAccessToken(saved)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.mobile == '" + mobile + "')].subject")
                        .value(SUBJECT))
                .andExpect(jsonPath("$.content[?(@.mobile == '" + mobile + "')].team")
                        .value(Teams.PACKERS));
    }

    @Test
    void theWaitlistCannotBeReadBack() throws Exception {
        mvc.perform(get(Routes.ServiceWaitlist.BASE))
                .andExpect(status().is4xxClientError());
    }
}
