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

    @Test
    void theSplitIsTheNewestLiveGroupWithItsFlat() {
        User host = user("9877731003");
        Property flat = new Property(host, "Pulse flat " + UUID.randomUUID(), "rent", "apartment", 36000L, "Aundh",
                "Pune");
        UUID flatId = properties.saveAndFlush(flat).getId();
        jdbc.update("update properties set bhk = 2 where id = ?", flatId);
        jdbc.update("insert into flatmate_groups (host_id, title, locality, rent, seats_total, property_id,"
                + " mod_status, created_at) values (?, 'Pulse group', 'Aundh', 36000, 3, ?, 'live',"
                + " now() + interval '1 minute')", host.getId(), flatId);
        jdbc.update("insert into flatmate_groups (host_id, title, locality, rent, seats_total, property_id,"
                + " mod_status, created_at) values (?, 'Pending group', 'Baner', 50000, 2, ?, 'pending',"
                + " now() + interval '2 minutes')", host.getId(), flatId);

        FlatmatePulse.Split split = pulse.pulse().split();

        assertThat(split).isNotNull();
        assertThat(split.locality()).isEqualTo("Aundh");
        assertThat(split.bhk()).isEqualByComparingTo(BigDecimal.valueOf(2));
        assertThat(split.rent()).isEqualTo(36000);
        assertThat(split.seats()).isEqualTo(3);
        assertThat(split.share()).isEqualTo(12000);
    }
}
