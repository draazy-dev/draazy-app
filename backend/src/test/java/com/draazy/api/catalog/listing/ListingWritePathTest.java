package com.draazy.api.catalog.listing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Listing write path - one guard for create, owner edit and moderator edit")
class ListingWritePathTest extends AbstractApiTest {

    private static final AtomicInteger MOBILES = new AtomicInteger(10000);
    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    ContactRequestRepository contactRequests;

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        jdbc.update("delete from audit_log where entity = 'property'");
    }

    private User user(String role) {
        User u = new User("98911" + MOBILES.incrementAndGet(), role);
        u.setName("Write Path " + role);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private User owner() {
        return user("owner");
    }

    private User staff() {
        return user(Roles.Wire.STAFF);
    }

    private Map<String, Object> body(User owner, Object... overrides) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("title", "Listing " + UUID.randomUUID().toString().substring(0, 8));
        m.put("deal", "rent");
        m.put("propertyType", "apartment");
        m.put("price", 25000);
        m.put("locality", "Kothrud");
        m.put("city", "Pune");
        m.put("images", List.of(listingPhoto(owner)));
        for (int i = 0; i < overrides.length; i += 2) {
            m.put((String) overrides[i], overrides[i + 1]);
        }
        return m;
    }

    private ResultActions create(User owner, Map<String, Object> body) throws Exception {
        return mvc.perform(post("/me/listings").header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)));
    }

    private ResultActions edit(User owner, Object id, Map<String, Object> body) throws Exception {
        return mvc.perform(patch("/me/listings/" + id).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)));
    }

    private ResultActions moderatorEdit(User staff, Object id, Map<String, Object> body) throws Exception {
        return mvc.perform(patch(Routes.Moderation.PROPERTY_ADMIN_UPDATE, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                .contentType(MediaType.APPLICATION_JSON).content(JSON.writeValueAsString(body)));
    }

    private Property saved(User owner, String type, String deal, String status) {
        Property p = new Property(owner, "Stored " + UUID.randomUUID().toString().substring(0, 8), deal, type,
                "buy".equals(deal) ? 5_000_000L : 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("buy".equals(deal) ? "total" : "per-month");
        p.setStatus(status);
        p.setLocalitySlug("kothrud");
        p.setArea(new BigDecimal("1000"));
        p.setAreaUnit("sqft");
        return properties.saveAndFlush(p);
    }

    private UUID createdId(ResultActions result) throws Exception {
        return UUID.fromString(JSON.readTree(result.andReturn().getResponse().getContentAsString())
                .get("id").asText());
    }

    private void refused(User owner, String field, Object... overrides) throws Exception {
        create(owner, body(owner, overrides))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[?(@.field=='" + field + "')]").isNotEmpty());
    }

    @Test
    @DisplayName("price: positive, Rs 1,000 Cr for a sale, Rs 1 Cr a month for rent")
    void priceCaps() throws Exception {
        User o = owner();
        refused(o, "price", "deal", "buy", "price", 10_000_000_001L);
        refused(o, "price", "price", 10_000_001);
        refused(o, "price", "price", 0);
        create(o, body(o, "deal", "buy", "price", 10_000_000_000L)).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("area: positive, and no more than 10,000 acres whatever the unit")
    void areaCaps() throws Exception {
        User o = owner();
        refused(o, "area", "area", 0);
        refused(o, "area", "area", 435_600_001);
        refused(o, "area", "propertyType", "Farm Land", "areaUnit", "acre", "area", 10_001);
        create(o, body(o, "propertyType", "Farm Land", "areaUnit", "acre", "area", 10_000))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("an owner edit and a moderator edit are held to the same caps")
    void editsAreCapped() throws Exception {
        User o = owner();
        User s = staff();
        Property p = saved(o, "apartment", "rent", PropertyStatus.APPROVED);

        edit(o, p.getId(), Map.of("price", 10_000_001)).andExpect(status().isUnprocessableEntity());
        edit(o, p.getId(), Map.of("area", 435_600_001)).andExpect(status().isUnprocessableEntity());
        moderatorEdit(s, p.getId(), Map.of("price", 10_000_001)).andExpect(status().isUnprocessableEntity());
        moderatorEdit(s, p.getId(), Map.of("area", 0)).andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("commercial, plot and farm land never store a bhk - create, owner edit and moderator edit")
    void nonResidentialStoresNoBhk() throws Exception {
        User o = owner();
        User s = staff();
        UUID shop = createdId(create(o, body(o, "propertyType", "Shop / Showroom", "bhk", 3))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.bhk").doesNotExist()));
        assertThat(properties.findById(shop).orElseThrow().getBhk()).isNull();

        UUID flat = createdId(create(o, body(o, "bhk", 3)).andExpect(status().isCreated()));
        assertThat(properties.findById(flat).orElseThrow().getBhk()).isEqualByComparingTo("3");

        Property plot = saved(o, "Open Plot", "buy", PropertyStatus.APPROVED);
        edit(o, plot.getId(), Map.of("bhk", 4)).andExpect(status().isOk());
        assertThat(properties.findById(plot.getId()).orElseThrow().getBhk()).isNull();

        Property office = saved(o, "Office Space", "rent", PropertyStatus.APPROVED);
        moderatorEdit(s, office.getId(), Map.of("bhk", 2)).andExpect(status().isOk())
                .andExpect(jsonPath("$.bhk").doesNotExist());
        assertThat(properties.findById(office.getId()).orElseThrow().getBhk()).isNull();
    }

    @Test
    @DisplayName("values the wizard never offers for the type are refused")
    void typeInconsistentValues() throws Exception {
        User o = owner();
        refused(o, "landUse", "landUse", "residential");
        refused(o, "areaUnit", "areaUnit", "sqyd");
        refused(o, "areaUnit", "propertyType", "Farm Land", "areaUnit", "sqft");
        refused(o, "areaUnit", "propertyType", "Open Plot", "areaUnit", "acre");
        refused(o, "floor", "floor", -1);
        refused(o, "lat", "lat", 91);
        refused(o, "lng", "lng", -181);
        create(o, body(o, "propertyType", "Open Plot", "areaUnit", "sqyd", "area", 200, "landUse", "residential"))
                .andExpect(status().isCreated());
        create(o, body(o, "propertyType", "Co-working Space", "commercialType", "coworking"))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("an edit that moves only the type is checked against the stored unit and land use")
    void editRechecksStoredValuesAgainstTheNewType() throws Exception {
        User o = owner();
        Property flat = saved(o, "apartment", "rent", PropertyStatus.PENDING);

        edit(o, flat.getId(), Map.of("landUse", "residential")).andExpect(status().isUnprocessableEntity());
        edit(o, flat.getId(), Map.of("areaUnit", "acre")).andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("pattern failures read as sentences, not regular expressions")
    void friendlyPatternMessages() throws Exception {
        User o = owner();
        create(o, body(o, "pincode", "41100", "video", "short"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[?(@.field=='pincode')].message", not(containsString("^"))))
                .andExpect(jsonPath("$.fields[?(@.field=='video')].message", not(containsString("{"))));
    }

    @Test
    @DisplayName("a sale stores none of the rent-only answers")
    void saleCarriesNoRentDefaults() throws Exception {
        User o = owner();
        UUID id = createdId(create(o, body(o, "deal", "buy", "price", 5_000_000, "deposit", 5000,
                "formDetails", Map.of("agreementDuration", "11", "lockIn", "3", "bestTimeToCall", "evening")))
                .andExpect(status().isCreated()));

        Property p = properties.findById(id).orElseThrow();
        assertThat(p.getDeposit()).isNull();
        assertThat(p.getFormDetails()).doesNotContainKeys("agreementDuration", "lockIn")
                .containsEntry("bestTimeToCall", "evening");
    }

    @Test
    @DisplayName("a sale drops the rent-only answers even when another stored answer is null")
    void saleToleratesNullFormDetail() {
        Property p = new Property(owner(), "Sale flat", "buy", "apartment", 5_000_000L, "Baner", "Pune");
        Map<String, Object> details = new java.util.HashMap<>();
        details.put("lockIn", "3");
        details.put("bestTimeToCall", null);
        p.setFormDetails(details);

        ListingShape.clearUnaskedAnswers(p);

        assertThat(p.getFormDetails()).doesNotContainKey("lockIn").containsEntry("bestTimeToCall", null);
    }

    @Test
    @DisplayName("repeated photo urls are stored once, in first-seen order")
    void photosAreDeduplicated() throws Exception {
        User o = owner();
        String a = listingPhoto(o);
        String b = listingPhoto(o);
        UUID id = createdId(create(o, body(o, "images", List.of(a, b, a, b, a))).andExpect(status().isCreated()));
        assertThat(properties.findById(id).orElseThrow().getImages()).containsExactly(a, b);

        edit(o, id, Map.of("images", List.of(b, b, a))).andExpect(status().isOk());
        assertThat(properties.findById(id).orElseThrow().getImages()).containsExactly(b, a);
    }

    @Test
    @DisplayName("replaying the same create inside ten minutes is a 409 that names the first listing")
    void replayedCreateIsRefused() throws Exception {
        User o = owner();
        Map<String, Object> first = body(o, "title", "Sunny 2 BHK near the park", "address", "Lane 4, Kothrud");
        UUID id = createdId(create(o, first).andExpect(status().isCreated()));

        Map<String, Object> replay = new LinkedHashMap<>(first);
        replay.put("title", "  sunny 2 bhk NEAR the park ");
        create(o, replay).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("duplicate_submission"))
                .andExpect(jsonPath("$.existingId").value(id.toString()));
        assertThat(properties.findByOwner_Id(o.getId(), org.springframework.data.domain.Pageable.unpaged())
                .getTotalElements()).isEqualTo(1);

        create(o, body(o, "title", "Sunny 2 BHK near the park", "address", "Lane 4, Kothrud", "price", 26000))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("an owner cannot edit a rejected, sold, rented or archived listing")
    void closedListingsAreNotEditable() throws Exception {
        User o = owner();
        for (String closed : List.of(PropertyStatus.REJECTED, PropertyStatus.SOLD, PropertyStatus.RENTED)) {
            Property p = saved(o, "apartment", "rent", closed);
            edit(o, p.getId(), Map.of("description", "A perfectly fine description of the flat."))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value("listing_not_editable"));
        }
        Property archived = saved(o, "apartment", "rent", PropertyStatus.APPROVED);
        archived.archive("Taken down by the owner");
        properties.saveAndFlush(archived);
        edit(o, archived.getId(), Map.of("price", 26000)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_not_editable"));
    }

    @Test
    @DisplayName("a flagged listing stays editable and stays flagged: a foundation edit raises a re-check, never pending")
    void flaggedFoundationEditKeepsTheFlag() throws Exception {
        User o = owner();
        Property p = saved(o, "apartment", "rent", PropertyStatus.FLAGGED);

        edit(o, p.getId(), Map.of("bhk", 3)).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(PropertyStatus.FLAGGED));

        Property stored = properties.findById(p.getId()).orElseThrow();
        assertThat(stored.getStatus()).isEqualTo(PropertyStatus.FLAGGED);
        assertThat(stored.getRecheckRequestedAt()).isNotNull();
        assertThat(stored.getRecheckReason()).isNotBlank();
    }

    @Test
    @DisplayName("a re-check carries old and new values to the back office, and loses them when cleared")
    void recheckChangesReachTheConsole() throws Exception {
        User o = owner();
        User s = staff();
        Property p = saved(o, "apartment", "rent", PropertyStatus.APPROVED);

        edit(o, p.getId(), Map.of("price", 30000)).andExpect(status().isOk());
        edit(o, p.getId(), Map.of("price", 36000, "description", "Freshly painted flat with a covered parking."))
                .andExpect(status().isOk());

        mvc.perform(get("/admin/properties/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(s)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.recheckChanges[?(@.field=='price')].before").value("25000"))
                .andExpect(jsonPath("$.recheckChanges[?(@.field=='price')].after").value("36000"))
                .andExpect(jsonPath("$.recheckChanges[?(@.field=='description')].before").value(""));
        mvc.perform(get("/admin/properties").header(HttpHeaders.AUTHORIZATION, bearer(s)))
                .andExpect(jsonPath("$.content[?(@.id=='" + p.getId() + "')].recheckChanges[0].field")
                        .value("price"));
        mvc.perform(get("/properties/" + p.getId())).andExpect(jsonPath("$.recheckChanges").doesNotExist());

        Property stored = properties.findById(p.getId()).orElseThrow();
        stored.clearRecheck();
        properties.saveAndFlush(stored);
        mvc.perform(get("/admin/properties/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(s)))
                .andExpect(jsonPath("$.recheckChanges").doesNotExist());
    }

    @Test
    @DisplayName("the daily-post 429 waits until the oldest post in the window ages out")
    void retryAfterIsWhenTheOldestPostAgesOut() throws Exception {
        User o = owner();
        Instant[] ages = {
                Instant.now().minus(23, ChronoUnit.HOURS), Instant.now().minus(5, ChronoUnit.HOURS),
                Instant.now().minus(1, ChronoUnit.HOURS)};
        for (Instant at : ages) {
            Property p = saved(o, "apartment", "rent", PropertyStatus.REJECTED);
            jdbc.update("update properties set created_at = ? where id = ?", Timestamp.from(at), p.getId());
        }

        String header = create(o, body(o)).andExpect(status().isTooManyRequests())
                .andReturn().getResponse().getHeader("Retry-After");
        int seconds = Integer.parseInt(header);
        assertThat(seconds).isBetween(3500, 3600);
        create(o, body(o)).andExpect(jsonPath("$.retryAfterSeconds").value(
                org.hamcrest.Matchers.allOf(org.hamcrest.Matchers.greaterThan(3490),
                        org.hamcrest.Matchers.lessThanOrEqualTo(3600))));
    }

    @Test
    @DisplayName("splitting someone else's listing answers exactly like an unknown id")
    void splitByNonOwnerIsIndistinguishableFromUnknown() throws Exception {
        User o = owner();
        User other = owner();
        Property p = saved(o, "apartment", "rent", PropertyStatus.APPROVED);
        String split = "{\"maxOccupants\":3,\"rooms\":[{\"roomKind\":\"master\",\"rent\":9000}]}";

        String foreign = mvc.perform(post("/properties/" + p.getId() + "/split")
                        .header(HttpHeaders.AUTHORIZATION, bearer(other))
                        .contentType(MediaType.APPLICATION_JSON).content(split))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();
        String unknown = mvc.perform(post("/properties/" + UUID.randomUUID() + "/split")
                        .header(HttpHeaders.AUTHORIZATION, bearer(other))
                        .contentType(MediaType.APPLICATION_JSON).content(split))
                .andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString();

        assertThat(JSON.readTree(foreign).get("error")).isEqualTo(JSON.readTree(unknown).get("error"));
        assertThat(JSON.readTree(foreign).get("message")).isEqualTo(JSON.readTree(unknown).get("message"));
    }

    @Test
    @DisplayName("a visit on a paused listing answers like a contact request: 409 listing_not_live")
    void visitOnClosedListingMatchesContact() throws Exception {
        User o = owner();
        User visitor = user(Roles.Wire.BUYER);
        Property paused = saved(o, "apartment", "rent", PropertyStatus.PAUSED);
        String slot = Instant.now().plus(2, ChronoUnit.DAYS).toString();

        mvc.perform(post("/visits").header(HttpHeaders.AUTHORIZATION, bearer(visitor))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + paused.getId() + "\",\"slot\":\"" + slot + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_not_live"));
        mvc.perform(post("/contacts/request").header(HttpHeaders.AUTHORIZATION, bearer(visitor))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + paused.getId() + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_not_live"));
    }

    @Test
    @DisplayName("an owner asking for contact on their own listing is refused and nothing is created")
    void ownerCannotRequestOwnContact() throws Exception {
        User o = owner();
        Property live = saved(o, "apartment", "rent", PropertyStatus.APPROVED);

        mvc.perform(post("/contacts/request").header(HttpHeaders.AUTHORIZATION, bearer(o))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + live.getId() + "\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("own_listing"));
        assertThat(contactRequests.findByRequesterIdAndPropertyId(o.getId(), live.getId())).isEmpty();
    }
}
