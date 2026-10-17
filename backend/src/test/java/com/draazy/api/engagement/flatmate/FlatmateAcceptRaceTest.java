package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import com.draazy.api.support.Races;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

// Commits for real: a race cannot be staged from the rolled-back AbstractApiTest transaction.
@SpringBootTest
@DisplayName("Two owners' clicks accepting different groups at once")
class FlatmateAcceptRaceTest {

    @Autowired FlatmateApplicationService service;
    @Autowired FlatmateGroupApplicationRepository applications;
    @Autowired FlatmateGroupRepository groups;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired JdbcTemplate jdbc;

    private final List<UUID> userIds = new ArrayList<>();
    private final List<UUID> groupIds = new ArrayList<>();
    private UUID listingId;

    @AfterEach
    void cleanUp() {
        jdbc.update("delete from notifications where user_id = any (?)", (Object) userIds.toArray(UUID[]::new));
        if (listingId != null) {
            jdbc.update("delete from flatmate_group_applications where listing_id = ?", listingId);
            jdbc.update("delete from properties where id = ?", listingId);
        }
        groupIds.forEach(id -> jdbc.update("delete from flatmate_groups where id = ?", id));
        userIds.forEach(id -> jdbc.update("delete from audit_log where actor = ?", id.toString()));
        userIds.forEach(id -> jdbc.update("delete from users where id = ?", id));
    }

    private User user(String mobile) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName("Race " + mobile);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        userIds.add(saved.getId());
        return saved;
    }

    private UUID applicationFrom(User host, UUID listing) {
        FlatmateGroup live = new FlatmateGroup(host.getId(), "Race group", "Baner", 40000L);
        live.setModStatus(FlatmateVocabulary.MOD_LIVE);
        FlatmateGroup group = groups.saveAndFlush(live);
        groupIds.add(group.getId());
        return applications.saveAndFlush(
                new FlatmateGroupApplication(listing, group.getId(), host.getId())).getId();
    }

    @Test
    @DisplayName("exactly one wins; the other is a 409 and the rest end declined")
    void exactlyOneAcceptance() {
        User owner = user("9876000601");
        listingId = properties.saveAndFlush(
                new Property(owner, "Race flat", "rent", "flat", 40_000L, "Baner", "Pune")).getId();
        UUID first = applicationFrom(user("9876000602"), listingId);
        UUID second = applicationFrom(user("9876000603"), listingId);
        UUID bystander = applicationFrom(user("9876000604"), listingId);
        AuthPrincipal caller = new AuthPrincipal(owner.getId(), Roles.Wire.BUYER, null, true, false);
        UUID[] racers = { first, second };

        List<Throwable> outcomes = Races.run(2, i -> service.decide(caller, racers[i], "accepted"));

        assertThat(outcomes.stream().filter(o -> o == null)).hasSize(1);
        assertThat(outcomes.stream().filter(o -> o != null))
                .singleElement().isInstanceOf(ConflictException.class);
        assertThat(jdbc.queryForObject(
                "select count(*) from flatmate_group_applications where listing_id = ? and status = 'accepted'",
                Long.class, listingId)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "select status from flatmate_group_applications where id = ?", String.class, bystander))
                .isEqualTo("declined");
    }
}
