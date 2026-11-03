package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.draazy.api.support.UploadedPhotos;
import com.jayway.jsonpath.JsonPath;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

class FlatmateRoomMustHavesTest extends AbstractApiTest {
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired EntityManager em;
    private User host;
    private String photos;
    private String ownerPropertyId;

    @BeforeEach
    void createHost() {
        host = new User("9811199302", Roles.Wire.BUYER);
        host.setName("Must Have Host");
        host.setMobileVerified(true);
        host = users.saveAndFlush(host);
        photos = String.join("\",\"", UploadedPhotos.of(host.getId()), UploadedPhotos.of(host.getId()),
                UploadedPhotos.of(host.getId()));
        Property flat = new Property(host, "Must have parent flat", "rent", "apartment",
                45000L, "Baner", "Pune");
        flat.setStatus(PropertyStatus.APPROVED);
        flat.verifyOwnership(Instant.now(), null);
        ownerPropertyId = properties.saveAndFlush(flat).getId().toString();
    }

    @AfterEach
    void cleanAudit() {
        jdbc.update("delete from audit_log where actor = ?", host.getId().toString());
    }

    @Test
    void createPersistsParkingAndAmenitiesAndEveryReadShowsThem() throws Exception {
        String id = idOf(create("\"parking\":\" car \",\"amenities\":[\"wifi\",\"lift\",\"power_backup\"]")
                .andExpect(jsonPath("$.parking").value("car"))
                .andExpect(jsonPath("$.amenities.length()").value(3)));
        assertStoredAndReadable(id, "car", List.of("wifi", "lift", "power_backup"));
    }

    @Test
    void roomsPostedWithoutThemReadAsNoParkingAndNoAmenities() throws Exception {
        String id = idOf(create(""));
        assertStoredAndReadable(id, null, List.of());
    }

    @Test
    void updateReplacesAndOmittedClears() throws Exception {
        String id = idOf(create("\"parking\":\"bike\",\"amenities\":[\"ac\"]"));
        assertStoredAndReadable(id, "bike", List.of("ac"));

        update(id, "\"parking\":\"car\",\"amenities\":[\"washing_machine\",\"wifi\"]")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.parking").value("car"));
        assertStoredAndReadable(id, "car", List.of("washing_machine", "wifi"));

        update(id, "").andExpect(status().isOk());
        assertStoredAndReadable(id, null, List.of());
    }

    @Test
    void editingThemDoesNotSendALiveRoomBackToModeration() throws Exception {
        String id = idOf(create("\"parking\":\"bike\""));
        update(id, "\"parking\":\"car\",\"amenities\":[\"ac\"]")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.modStatus").value("live"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"\"hot_tub\"", "\"WIFI\"", "\"\"", "\"wifi\",\"wifi\""})
    void unknownBlankOrRepeatedAmenityIsRefusedOnCreateAndUpdate(String codes) throws Exception {
        String fields = "\"amenities\":[" + codes + "]";
        mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content(body(fields)))
                .andExpect(status().isUnprocessableEntity());
        assertThat(jdbc.queryForObject("select count(*) from flatmate_rooms where host_id = ?",
                Integer.class, host.getId())).isZero();

        String id = idOf(create("\"amenities\":[\"ac\"]"));
        update(id, fields).andExpect(status().isUnprocessableEntity());
        assertStoredAndReadable(id, null, List.of("ac"));
    }

    @Test
    void moreThanFiveAmenitiesIsRefused() throws Exception {
        mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body("\"amenities\":[\"wifi\",\"ac\",\"washing_machine\",\"lift\","
                                + "\"power_backup\",\"wifi\"]")))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void unknownParkingIsRefused() throws Exception {
        mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content(body("\"parking\":\"helicopter\"")))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void stayLengthIsTheLockInAndReachesTheDetailRead() throws Exception {
        String id = idOf(create("\"lockInMonths\":6"));
        mvc.perform(get(Routes.Flatmates.ROOM_BY_ID, id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.lockInMonths").value(6));
    }

    private ResultActions create(String fields) throws Exception {
        return mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content(body(fields)))
                .andExpect(status().isCreated());
    }

    private ResultActions update(String id, String fields) throws Exception {
        return mvc.perform(patch(Routes.Flatmates.ROOMS + "/" + id)
                .header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON).content(body(fields)));
    }

    private static String idOf(ResultActions result) throws Exception {
        return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.id");
    }

    private String body(String fields) {
        String basics = fields.contains("lockInMonths")
                ? FlatmateRoomFixture.BASICS.replace(",\"lockInMonths\":0", "")
                : FlatmateRoomFixture.BASICS;
        return """
                {"bhk":"2","roomType":"Private room","attachedBath":"attached","locality":"Baner",
                 "society":"Must Have House","rentShare":15000,"deposit":30000,"hostRole":"owner",
                 "propertyId":"%s",
                 "photos":["%s"]%s,%s,%s}
                """.formatted(ownerPropertyId, photos, fields.isEmpty() ? "" : "," + fields, basics,
                FlatmateRoomFixture.DETAILS);
    }

    private void assertStoredAndReadable(String id, String parking, List<String> amenities) throws Exception {
        em.flush();
        em.clear();
        var stored = jdbc.queryForMap(
                "select parking, amenities::text as amenities from flatmate_rooms where id = ?",
                UUID.fromString(id));
        assertThat(stored.get("parking")).isEqualTo(parking);
        assertThat(JsonPath.<List<String>>read(stored.get("amenities").toString(), "$")).isEqualTo(amenities);
        for (String route : new String[]{Routes.Flatmates.ROOM_BY_ID, Routes.Flatmates.FEED}) {
            boolean detail = route.equals(Routes.Flatmates.ROOM_BY_ID);
            var request = detail
                    ? get(route, id).header(HttpHeaders.AUTHORIZATION, bearer(host))
                    : get(route).param("size", "100").param("tab", "move-in");
            String response = mvc.perform(request).andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            List<java.util.Map<String, Object>> matches = detail
                    ? List.of(JsonPath.<java.util.Map<String, Object>>read(response, "$.item"))
                    : JsonPath.read(response, "$.content[?(@.id == '" + id + "')]");
            assertThat(matches).as(route).hasSize(1);
            assertThat(matches.getFirst().get("parking")).as(route).isEqualTo(parking);
            assertThat(matches.getFirst().get("amenities")).as(route).isEqualTo(amenities);
        }
        mvc.perform(get(Routes.Flatmates.ROOM_BY_ID, id))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.amenities.length()").value(amenities.size()));
    }
}
