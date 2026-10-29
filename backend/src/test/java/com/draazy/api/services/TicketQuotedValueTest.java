package com.draazy.api.services;

import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Slice 11 — a quote is not a deal value")
class TicketQuotedValueTest extends ServiceFixtures {
    private static final long QUOTE = 18_499L;

    @Test
    @DisplayName("the customer's accepted price is stored and echoed back to them")
    void theQuoteSurvivesTheBooking() throws Exception {
        User buyer = customer("9820000401");

        mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Move-in Pack booking\",\"team\":\"packers\","
                                + "\"quotedValue\":" + QUOTE + "}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quotedValue").value(QUOTE))
                .andExpect(jsonPath("$.value").value(nullValue()));
    }

    @Test
    @DisplayName("a client still cannot set the deal value, quote or no quote")
    void theDealValueIsNotTheClientsToSet() throws Exception {
        User buyer = customer("9820000402");

        mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Move-in Pack booking\",\"team\":\"packers\","
                                + "\"quotedValue\":" + QUOTE + ",\"value\":99900000}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.value").value(nullValue()))
                .andExpect(jsonPath("$.quotedValue").value(QUOTE));
    }

    @Test
    @DisplayName("the quote survives a PATCH that changes something else")
    void theQuoteSurvivesUnrelatedWork() throws Exception {
        User buyer = customer("9820000403");
        User desk = staff("9820000404", Teams.PACKERS);
        String id = raise(buyer, "{\"subject\":\"Move-in Pack booking\",\"team\":\"packers\","
                + "\"quotedValue\":" + QUOTE + "}");

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"in-progress\",\"priority\":\"high\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("in-progress"))
                .andExpect(jsonPath("$.quotedValue").value(QUOTE));
    }

    @Test
    @DisplayName("a quote cannot be edited after the fact")
    void aQuoteCannotBeEditedAfterTheFact() throws Exception {
        User buyer = customer("9820000405");
        User desk = staff("9820000406", Teams.PACKERS);
        String id = raise(buyer, "{\"subject\":\"Move-in Pack booking\",\"team\":\"packers\","
                + "\"quotedValue\":" + QUOTE + "}");

        mvc.perform(patch(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"quotedValue\":1}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Tickets.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(desk)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.quotedValue").value(QUOTE));
    }

    @Test
    @DisplayName("a negative quote is refused, and zero is not")
    void zeroIsAQuoteAndMinusOneIsNot() throws Exception {
        User buyer = customer("9820000409");

        mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Free survey\",\"team\":\"packers\","
                                + "\"quotedValue\":-1}"))
                .andExpect(status().isUnprocessableEntity());

        mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Free survey\",\"team\":\"packers\","
                                + "\"quotedValue\":0}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quotedValue").value(0));
    }

    @Test
    @DisplayName("a ticket raised without a quote has none, rather than zero")
    void noQuoteIsNotAZeroQuote() throws Exception {
        User buyer = customer("9820000408");

        mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"subject\":\"Need a rent agreement\",\"team\":\"legal\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.quotedValue").value(nullValue()));
    }

    private String raise(User caller, String body) throws Exception {
        String json = mvc.perform(post(Routes.Tickets.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(json, "id");
    }
}
