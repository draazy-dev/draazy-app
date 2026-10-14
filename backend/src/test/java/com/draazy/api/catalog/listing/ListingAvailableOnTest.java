package com.draazy.api.catalog.listing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.AvailableOn;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Listings — the exact available date and its derived bucket")
class ListingAvailableOnTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    private User owner;

    @BeforeEach
    void owner() {
        User u = new User("9876400001", "owner");
        u.setName("Date Owner");
        u.setMobileVerified(true);
        owner = users.saveAndFlush(u);
    }

    private String body(String extra) {
        return """
                {"title":"Dated listing","deal":"rent","propertyType":"apartment","price":25000,
                 "bhk":2,"locality":"Kothrud","city":"Pune","images":["/api/dev/storage/public/photos/%s/%s"]%s}
                """.formatted(owner.getId(), UUID.randomUUID(), extra);
    }

    private org.springframework.test.web.servlet.ResultActions create(String extra) throws Exception {
        return mvc.perform(post("/me/listings").header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON).content(body(extra)));
    }

    private LocalDate stored(String id) {
        return properties.findById(UUID.fromString(id)).orElseThrow().getAvailableOn();
    }

    private String idOf(ResultActions created) throws Exception {
        return created.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()
                .replaceAll("(?s).*?\"id\":\"([^\"]+)\".*", "$1");
    }

    private ResultActions detail(String id) throws Exception {
        return mvc.perform(get("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("create stores the date and the detail answers with it, the derived bucket and availableDate")
    void createStoresDate() throws Exception {
        LocalDate on = AvailableOn.today().plusDays(10);
        detail(idOf(create(",\"availableOn\":\"" + on + "\"")))
                .andExpect(jsonPath("$.availableOn").value(on.toString()))
                .andExpect(jsonPath("$.availableDate").value(on.toString()))
                .andExpect(jsonPath("$.availableFrom").value("15"));
    }

    @Test
    @DisplayName("create refuses a past date, a date beyond a year and a malformed date")
    void createValidation() throws Exception {
        create(",\"availableOn\":\"" + AvailableOn.today().minusDays(1) + "\"").andExpect(status().isUnprocessableEntity());
        create(",\"availableOn\":\"" + AvailableOn.today().plusDays(366) + "\"").andExpect(status().isUnprocessableEntity());
        create(",\"availableOn\":\"01-12-2026\"").andExpect(status().isUnprocessableEntity());
        create(",\"availableOn\":\"" + AvailableOn.today().plusDays(365) + "\"").andExpect(status().isCreated());
    }

    private String saleBody(String possession, String extra) {
        return """
                {"title":"Dated sale","deal":"buy","propertyType":"apartment","price":5000000,
                 "bhk":2,"locality":"Kothrud","city":"Pune","possession":"%s",
                 "images":["/api/dev/storage/public/photos/%s/%s"]%s}
                """.formatted(possession, owner.getId(), UUID.randomUUID(), extra);
    }

    private ResultActions createSale(String possession, LocalDate on) throws Exception {
        return mvc.perform(post("/me/listings").header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON)
                .content(saleBody(possession, ",\"availableOn\":\"" + on + "\"")));
    }

    @Test
    @DisplayName("a sale may carry a possession date up to 5 years out, rent stays at a year")
    void saleWindowIsFiveYears() throws Exception {
        LocalDate today = AvailableOn.today();
        create(",\"availableOn\":\"" + today.plusDays(366) + "\"").andExpect(status().isUnprocessableEntity());
        LocalDate fourYears = today.plusYears(4);
        detail(idOf(createSale("under-construction", fourYears)))
                .andExpect(jsonPath("$.availableOn").value(fourYears.toString()));
        createSale("under-construction", today.plusYears(5)).andExpect(status().isCreated());
        createSale("under-construction", today.plusYears(5).plusDays(1)).andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("only a ready-to-move sale has its date cleared")
    void readyToMoveSaleClearsTheDate() throws Exception {
        LocalDate on = AvailableOn.today().plusYears(2);
        detail(idOf(createSale("ready-to-move", on))).andExpect(jsonPath("$.availableOn").doesNotExist());
        detail(idOf(createSale("new-launch", on))).andExpect(jsonPath("$.availableOn").value(on.toString()));
    }

    @Test
    @DisplayName("a PATCH on a sale accepts a date beyond a year, and one beyond five years is refused")
    void patchSaleWindow() throws Exception {
        String id = idOf(createSale("under-construction", AvailableOn.today().plusYears(1)));
        LocalDate on = AvailableOn.today().plusYears(4);
        patchListing(id, "{\"availableOn\":\"" + on + "\"}").andExpect(status().isOk());
        assertThat(stored(id)).isEqualTo(on);
        patchListing(id, "{\"availableOn\":\"" + AvailableOn.today().plusYears(5).plusDays(1) + "\"}")
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("the legacy bucket converts to a date, and availableOn wins when both arrive")
    void legacyBucketAndPrecedence() throws Exception {
        detail(idOf(create(",\"availableFrom\":\"30\"")))
                .andExpect(jsonPath("$.availableOn").value(AvailableOn.today().plusDays(30).toString()))
                .andExpect(jsonPath("$.availableFrom").value("30"));
        detail(idOf(create(",\"availableFrom\":\"now\"")))
                .andExpect(jsonPath("$.availableOn").value(AvailableOn.today().toString()));
        detail(idOf(create(",\"availableFrom\":\"now\",\"availableOn\":\"" + AvailableOn.today().plusDays(20) + "\"")))
                .andExpect(jsonPath("$.availableOn").value(AvailableOn.today().plusDays(20).toString()))
                .andExpect(jsonPath("$.availableFrom").value("30"));
    }

    @Test
    @DisplayName("a PATCH sets the date, a blank clears it, and an untouched field leaves it")
    void patchSetsAndClears() throws Exception {
        String id = idOf(create(""));
        assertThat(stored(id)).isNull();

        LocalDate on = AvailableOn.today().plusDays(40);
        patchListing(id, "{\"availableOn\":\"" + on + "\"}").andExpect(status().isOk());
        assertThat(stored(id)).isEqualTo(on);

        patchListing(id, "{\"description\":\"Roomy and bright\"}").andExpect(status().isOk());
        assertThat(stored(id)).isEqualTo(on);

        patchListing(id, "{\"availableOn\":\"\"}").andExpect(status().isOk());
        assertThat(stored(id)).isNull();
    }

    @Test
    @DisplayName("an edit that echoes a date now in the past is not refused")
    void patchAllowsStaleDate() throws Exception {
        String id = idOf(create(""));
        LocalDate past = AvailableOn.today().minusDays(5);
        patchListing(id, "{\"availableOn\":\"" + past + "\"}").andExpect(status().isOk());
        assertThat(stored(id)).isEqualTo(past);
    }

    @Test
    @DisplayName("search by bucket is a date predicate: free by day N, undated matches nothing")
    void searchBoundaries() throws Exception {
        LocalDate today = AvailableOn.today();
        persist("Today", today);
        persist("Day 15", today.plusDays(15));
        persist("Day 16", today.plusDays(16));
        persist("Day 30", today.plusDays(30));
        persist("Day 31", today.plusDays(31));
        persist("Undated", null);

        assertThat(count("now")).isEqualTo(1);
        assertThat(count("15")).isEqualTo(2);
        assertThat(count("30")).isEqualTo(4);
        assertThat(count("whenever")).isZero();
    }

    private org.springframework.test.web.servlet.ResultActions patchListing(String id, String json) throws Exception {
        return mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private void persist(String title, LocalDate on) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setStatus(PropertyStatus.APPROVED);
        p.setLocalitySlug("kothrud");
        p.setAvailableOn(on);
        properties.saveAndFlush(p);
    }

    private int count(String bucket) throws Exception {
        String json = mvc.perform(get("/properties?availableFrom=" + bucket + "&owner=" + owner.getId()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return Integer.parseInt(json.replaceAll("(?s).*\"totalElements\"\\s*:\\s*(\\d+).*", "$1"));
    }
}
