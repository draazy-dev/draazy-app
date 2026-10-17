package com.draazy.api.moderation.duplicate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Moderation — merging duplicates tells the owner and keeps the row visible")
class DuplicateMergeOwnerNoticeTest extends AbstractApiTest {

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @PersistenceContext
    EntityManager em;

    private User user(String mobile, String role) {
        User user = new User(mobile, role);
        user.setName(mobile);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    private Property listing(User owner, String meter) {
        Property property = new Property(owner, "Dup flat", "rent", "apartment", 32000L, "Baner", "Pune");
        property.setElectricityMeterKey(meter);
        property.setStatus(PropertyStatus.PENDING);
        return properties.saveAndFlush(property);
    }

    @Test
    @DisplayName("the dropped listing's owner gets a notification and still sees it, archived, with the reason")
    void ownerIsToldAndStillSeesTheListing() throws Exception {
        User admin = user("9833340101", "admin");
        User keeper = user("9833340102", "owner");
        User loser = user("9833340103", "owner");
        Property keep = listing(keeper, "meter-merge-notice");
        Property drop = listing(loser, "meter-merge-notice");

        mvc.perform(post("/admin/properties/duplicates/merge")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"keepId\":\"" + keep.getId() + "\",\"dropIds\":[\"" + drop.getId() + "\"]}"))
                .andExpect(status().is2xxSuccessful());

        List<String> types = jdbc.queryForList(
                "select type from notifications where user_id = ?", String.class, loser.getId());
        assertThat(types).containsExactly("listing.archived_duplicate");
        assertThat(jdbc.queryForList("select 1 from notifications where user_id = ?", keeper.getId())).isEmpty();

        mvc.perform(get("/me/listings").header(HttpHeaders.AUTHORIZATION, bearer(loser)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].archived").value(true))
                .andExpect(jsonPath("$.content[0].archivedNote").value("Archived as a duplicate of another listing."));
    }

    @Test
    @DisplayName("an owner's own takedown carries no note, so it stays out of My Properties")
    void ownerTakedownHasNoNote() throws Exception {
        User owner = user("9833340104", "owner");
        Property own = listing(owner, "meter-own-takedown");
        jdbc.update("update properties set archived = true, archive_reason = 'Taken down by the owner' where id = ?",
                own.getId());
        em.clear();

        mvc.perform(get("/me/listings").header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].archived").value(true))
                .andExpect(jsonPath("$.content[0].archivedNote").doesNotExist());
    }

    @Test
    @DisplayName("an unknown keeper archives nothing, and a maker cannot decide their own listing's cluster")
    void unknownKeeperAndMakerAreRefused() throws Exception {
        User admin = user("9833340105", "admin");
        User rival = user("9833340106", "owner");
        Property own = listing(admin, "meter-merge-maker");
        Property theirs = listing(rival, "meter-merge-maker");
        String merge = "{\"keepId\":\"%s\",\"dropIds\":[\"%s\"]}";

        mvc.perform(post("/admin/properties/duplicates/merge")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(merge.formatted(UUID.randomUUID(), theirs.getId())))
                .andExpect(status().isNotFound());
        mvc.perform(post("/admin/properties/duplicates/merge")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(merge.formatted(own.getId(), theirs.getId())))
                .andExpect(status().isForbidden());
        mvc.perform(post("/admin/properties/duplicates/dismiss")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ids\":[\"" + own.getId() + "\",\"" + theirs.getId() + "\"]}"))
                .andExpect(status().isForbidden());

        assertThat(properties.findById(theirs.getId()).orElseThrow().isArchived()).isFalse();
    }

    @Test
    @DisplayName("two crossing merges cannot archive both listings: the second is stale")
    void crossingMergesLeaveOneLive() throws Exception {
        User admin = user("9891600101", "admin");
        Property x = listing(user("9891600102", "owner"), "meter-cross");
        Property y = listing(user("9891600103", "owner"), "meter-cross");
        String merge = "{\"keepId\":\"%s\",\"dropIds\":[\"%s\"]}";

        mvc.perform(post("/admin/properties/duplicates/merge")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(merge.formatted(x.getId(), y.getId())))
                .andExpect(status().is2xxSuccessful());
        mvc.perform(post("/admin/properties/duplicates/merge")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(merge.formatted(y.getId(), x.getId())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("stale_decision"));

        em.clear();
        assertThat(properties.findById(x.getId()).orElseThrow().isArchived()).isFalse();
        assertThat(properties.findById(y.getId()).orElseThrow().isArchived()).isTrue();
    }

    @Test
    @DisplayName("a different-case keep id inside dropIds is still the keeper and is never archived")
    void caseVariantKeepIdIsNotDropped() throws Exception {
        User admin = user("9891600104", "admin");
        Property keep = listing(user("9891600105", "owner"), "meter-case");
        Property drop = listing(user("9891600106", "owner"), "meter-case");

        mvc.perform(post("/admin/properties/duplicates/merge")
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"keepId\":\"" + keep.getId() + "\",\"dropIds\":[\""
                                + keep.getId().toString().toUpperCase() + "\",\"" + drop.getId() + "\"]}"))
                .andExpect(status().is2xxSuccessful());

        em.clear();
        assertThat(properties.findById(keep.getId()).orElseThrow().isArchived()).isFalse();
        assertThat(properties.findById(drop.getId()).orElseThrow().isArchived()).isTrue();
    }
}
