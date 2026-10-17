package com.draazy.api.catalog.managed;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.Races;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

// Not on AbstractApiTest: its rollback hides commits, and a publish race only exists across commits.
@SpringBootTest
@DisplayName("Concurrent publishes of one managed record")
class ManagedPropertyPublishRaceTest {

    private static final int RACERS = 6;

    private static final String OWNER_MOBILE = "9876000431";

    private static final String LOCALITY = "PublishRaceTown";

    @Autowired ManagedPropertyService service;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;

    private User owner;

    @BeforeEach
    void setUp() {
        wipe();
        jdbc.update("insert into localities (slug, name, city, lat, lng, place_id, active) "
                + "values ('publishracetown', ?, 'Pune', 18.52, 73.85, 'fixture-publishracetown', true)", LOCALITY);
        User row = new User(OWNER_MOBILE, "owner");
        row.setName("Race Owner");
        row.setMobileVerified(true);
        owner = users.saveAndFlush(row);
    }

    @AfterEach
    void cleanUp() {
        wipe();
        owner = null;
    }

    private void wipe() {
        String ownerIds = "(select id from users where mobile = ?)";
        jdbc.update("delete from managed_properties where owner_id in " + ownerIds, OWNER_MOBILE);
        jdbc.update("delete from properties where owner_id in " + ownerIds, OWNER_MOBILE);
        jdbc.update("delete from notifications where user_id in " + ownerIds, OWNER_MOBILE);
        jdbc.update("delete from users where mobile = ?", OWNER_MOBILE);
        jdbc.update("delete from localities where slug = 'publishracetown'");
    }

    @Test
    @DisplayName("create exactly one marketplace listing and all callers see it")
    void concurrentPublishesCreateOneListing() {
        ManagedPropertyDto record = service.register(owner.getId(), new ManagedPropertyCreateRequest(
                null, "rent", "Flat", null, 25000L, LOCALITY, null, null, null, null, null,
                null, null, null, null, null, null));
        List<ManagedPropertyDto> results = new CopyOnWriteArrayList<>();

        List<Throwable> outcomes = Races.run(RACERS,
                index -> results.add(service.publish(owner.getId(), record.id())));

        assertThat(outcomes).as("a loser returns the winner's listing, never an error").containsOnlyNulls();
        Integer listings = jdbc.queryForObject(
                "select count(*) from properties where owner_id = ?", Integer.class, owner.getId());
        assertThat(listings).isEqualTo(1);
        Set<String> linked = results.stream()
                .map(ManagedPropertyDto::publishedListingId).collect(Collectors.toSet());
        assertThat(linked).hasSize(1).doesNotContainNull();
    }
}
