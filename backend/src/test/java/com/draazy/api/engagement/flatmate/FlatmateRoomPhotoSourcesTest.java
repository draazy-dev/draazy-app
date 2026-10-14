package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.draazy.api.support.UploadedPhotos;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Flatmate rooms — a photo is one the host uploaded, never a link to somewhere else")
class FlatmateRoomPhotoSourcesTest extends AbstractApiTest {

    private static final String FOREIGN = "https://evil.example/room.jpg";

    @Autowired UserRepository users;
    @Autowired FlatmateRoomRepository rooms;

    private User host(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName("Room Source Host");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private static String room(String... photos) {
        return """
                {"bhk":"2","roomType":"Private room","attachedBath":"attached","furnishing":"semi",
                 "locality":"Baner","society":"Source Heights","rentShare":15000,"deposit":30000,
                 "availableFrom":"2026-09-01","lookingFor":"any","foodPref":"any","hostRole":"owner",
                 "photos":["%s"],"note":"Sunny room."}
                """.formatted(String.join("\",\"", photos));
    }

    private ResultActions create(User h, String body) throws Exception {
        return mvc.perform(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(h))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions edit(User h, UUID id, String body) throws Exception {
        return mvc.perform(patch(Routes.Flatmates.ROOM_BY_ID, id).header(HttpHeaders.AUTHORIZATION, bearer(h))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    @Test
    @DisplayName("the host's own upload is accepted; a foreign link or another user's upload is refused")
    void onlyTheHostsUploadsAreAccepted() throws Exception {
        User h = host("9861540001");
        User other = host("9861540002");

        create(h, room(UploadedPhotos.of(h.getId()))).andExpect(status().isCreated());
        create(h, room(FOREIGN)).andExpect(status().isUnprocessableEntity());
        create(h, room(UploadedPhotos.of(other.getId()))).andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("an edit may keep a photo the room already had, but may not add a foreign one")
    void anEditKeepsWhatItHadButAddsOnlyUploads() throws Exception {
        User h = host("9861540003");
        create(h, room(UploadedPhotos.of(h.getId()))).andExpect(status().isCreated());
        FlatmateRoom saved = rooms.findAll().stream()
                .filter(r -> r.getHostId().equals(h.getId())).findFirst().orElseThrow();
        String legacy = "https://images.unsplash.com/photo-legacy.jpg";
        saved.setPhotos(new ArrayList<>(List.of(legacy)));
        rooms.saveAndFlush(saved);

        edit(h, saved.getId(), room(legacy, UploadedPhotos.of(h.getId()))).andExpect(status().isOk());
        edit(h, saved.getId(), room(legacy, FOREIGN)).andExpect(status().isUnprocessableEntity());
        assertThat(rooms.findById(saved.getId()).orElseThrow().getPhotos()).doesNotContain(FOREIGN);
    }
}
