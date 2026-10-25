package com.draazy.api.engagement.flatmate;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Flatmate rooms — a new post must answer the basics; an edit is not held to them")
class NewRoomRequirementsTest extends AbstractApiTest {

    @Autowired UserRepository users;

    private User host(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName("Room Basics Host");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String body(String extra) {
        return withSocietyIds("""
                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                 "locality":"Baner","society":"Basics Heights","rentShare":15000,"deposit":30000,
                 "availableFrom":"2026-09-01","lookingFor":"any","foodPref":"any",
                 "hostRole":"owner","note":"Sunny room.",%s}
                """.formatted(extra));
    }

    private String postRoom(User h, String content) throws Exception {
        return mvc.perform(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(h))
                        .contentType(MediaType.APPLICATION_JSON).content(content))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    @Test
    @DisplayName("a new room missing the basics is refused, naming each one")
    void missingBasicsAreRefused() throws Exception {
        User h = host("9861540001");
        mvc.perform(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(h))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(FlatmateRoomFixture.photos(h.getId())).replace("\"attachedBath\":\"attached\",", "")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("A new room needs: home type, washroom, furnishing, "
                        + "flat / house number, bathrooms, notice period, lock-in."));
    }

    @Test
    @DisplayName("a flat is asked for its floor and the building's height")
    void flatNeedsFloorAndTotalFloors() throws Exception {
        User h = host("9861540005");
        String flat = body(FlatmateRoomFixture.BASICS + ",\"details\":{\"bathrooms\":2},"
                + FlatmateRoomFixture.photos(h.getId()));
        mvc.perform(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(h))
                        .contentType(MediaType.APPLICATION_JSON).content(flat))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("A new room needs: floor, total floors."));
    }

    @Test
    @DisplayName("a house is asked for its floor count instead of a floor and building height")
    void houseNeedsFloorsInHouse() throws Exception {
        User h = host("9861540002");
        String house = body(FlatmateRoomFixture.BASICS.replace("\"Flat\"", "\"Villa\"") + ","
                + "\"details\":{\"bathrooms\":2}," + FlatmateRoomFixture.photos(h.getId()));
        mvc.perform(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(h))
                        .contentType(MediaType.APPLICATION_JSON).content(house))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("A new room needs: floors in the house."));
    }

    @Test
    @DisplayName("a new room with fewer than 3 photos is refused")
    void fewerThanThreePhotosAreRefused() throws Exception {
        User h = host("9861540003");
        mvc.perform(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(h))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(FlatmateRoomFixture.BASICS + "," + FlatmateRoomFixture.DETAILS + ","
                                + FlatmateRoomFixture.photos(h.getId(), 2))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message").value("A new room needs at least 3 photos."));
    }

    @Test
    @DisplayName("a complete room posts, and a later edit without the basics still saves")
    void editIsNotHeldToTheBasics() throws Exception {
        User h = host("9861540004");
        String created = postRoom(h, body(FlatmateRoomFixture.BASICS + "," + FlatmateRoomFixture.DETAILS + ","
                + FlatmateRoomFixture.photos(h.getId())));
        String id = JsonPath.read(created, "$.id");
        mvc.perform(patch(Routes.Flatmates.ROOM_BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(h))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(FlatmateRoomFixture.photos(h.getId(), 1))))
                .andExpect(status().isOk());
    }
}
