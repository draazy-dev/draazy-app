package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Home flatmate pulse — counted from the board's own public rows")
class FlatmatePulseTest extends AbstractApiTest {

    @Autowired FlatmatePulseService pulse;

    @Autowired UserRepository users;

    @Autowired PropertyRepository properties;

    private User user(String mobile) {
        User u = new User(mobile, "buyer");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    // A minute ahead so a committed row from another test can never be "newer".
    private void seekerPost(User seeker, String name, String modStatus) {
        jdbc.update("insert into flatmate_seeker_posts (user_id, name, budget, mod_status, created_at)"
                + " values (?, ?, 20000, ?, now() + interval '1 minute')", seeker.getId(), name, modStatus);
    }

    @Test
    void aLiveSeekerIsCountedAndLeadsTheFaces() {
        long before = pulse.pulse().seeking();

        seekerPost(user("9877731001"), "Riya Sharma", "live");
        seekerPost(user("9877731002"), "Hidden Person", "pending");

        FlatmatePulse after = pulse.pulse();
        assertThat(after.seeking()).isEqualTo(before + 1);
        assertThat(after.initials()).hasSizeLessThanOrEqualTo(FlatmatePulse.FACES).first().isEqualTo("RS");
    }

    private void group(User host, String title, String locality, long rent, int seats, String bhk, boolean hunting,
            UUID propertyId, String modStatus, int minutesAhead) {
        jdbc.update("insert into flatmate_groups (host_id, title, locality, rent, seats_total, seats_open, pref_bhk,"
                + " hunting, property_id, mod_status, created_at)"
                + " values (?, ?, ?, ?, ?, 1, ?::jsonb, ?, ?, ?, now() + (? * interval '1 minute'))",
                host.getId(), title, locality, rent, seats, bhk, hunting, propertyId, modStatus, minutesAhead);
    }

    @Test
    @DisplayName("the split is the newest live hunting team with an open seat, its one flat size and its budget")
    void theSplitIsTheNewestLiveHuntingTeam() {
        User host = user("9877731003");
        UUID flatId = properties.saveAndFlush(new Property(host, "Pulse flat " + UUID.randomUUID(), "rent",
                "apartment", 36000L, "Aundh", "Pune")).getId();
        group(host, "Pulse team", "Aundh", 36000, 3, "[\"2\"]", true, null, "live", 1);
        group(host, "Pending team", "Baner", 50000, 2, "[]", true, null, "pending", 2);
        group(host, "Settled group", "Wakad", 45000, 4, "[]", false, flatId, "live", 3);
        group(host, "Lone hunter", "Kothrud", 20000, 1, "[]", true, null, "live", 4);

        FlatmatePulse.Split split = pulse.pulse().split();

        assertThat(split).isNotNull();
        assertThat(split.locality()).isEqualTo("Aundh");
        assertThat(split.bhk()).isEqualByComparingTo(BigDecimal.valueOf(2));
        assertThat(split.rent()).isEqualTo(36000);
        assertThat(split.seats()).isEqualTo(3);
        assertThat(split.share()).isEqualTo(12000);
    }

    @Test
    @DisplayName("a team open to several flat sizes names none")
    void severalFlatSizesLeaveTheBhkOut() {
        group(user("9877731005"), "Flexible team", "Aundh", 36000, 3, "[\"2\",\"3\"]", true, null, "live", 1);

        FlatmatePulse.Split split = pulse.pulse().split();

        assertThat(split).isNotNull();
        assertThat(split.locality()).isEqualTo("Aundh");
        assertThat(split.bhk()).isNull();
    }
}
