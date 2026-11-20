package com.draazy.api.deals.visit;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.listing.ListingArchiveService;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.Races;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
@DisplayName("Booking a visit while the owner archives the listing")
class VisitArchiveRaceTest {

    @Autowired VisitService visitService;
    @Autowired ListingArchiveService listings;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired JdbcTemplate jdbc;

    private final List<UUID> userIds = new ArrayList<>();
    private final List<UUID> listingIds = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        UUID[] people = userIds.toArray(UUID[]::new);
        UUID[] homes = listingIds.toArray(UUID[]::new);
        jdbc.update("delete from audit_log where entity = 'visit' and entity_id in "
                + "(select id::text from visits where property_id = any (?))", (Object) homes);
        jdbc.update("delete from audit_log where actor = any (?)", (Object) java.util.Arrays.stream(people)
                .map(UUID::toString).toArray(String[]::new));
        jdbc.update("delete from visits where property_id = any (?)", (Object) homes);
        jdbc.update("delete from notifications where user_id = any (?)", (Object) people);
        jdbc.update("delete from properties where id = any (?)", (Object) homes);
        jdbc.update("delete from users where id = any (?)", (Object) people);
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Race " + mobile);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        userIds.add(saved.getId());
        return saved;
    }

    @Test
    @DisplayName("no live visit is ever left on an archived listing")
    void noLiveVisitSurvivesTheArchive() {
        User owner = user("9876000701", Roles.Wire.OWNER);
        User buyer = user("9876000702", Roles.Wire.BUYER);
        for (int round = 0; round < 5; round++) {
            Property p = new Property(owner, "Race flat " + round, "rent", "apartment", 25_000L, "Kothrud", "Pune");
            p.setBhk(new BigDecimal("2"));
            p.setStatus(PropertyStatus.APPROVED);
            p.setPriceUnit("per-month");
            p.setArea(new BigDecimal("1000"));
            UUID id = properties.saveAndFlush(p).getId();
            listingIds.add(id);
            VisitCreateRequest booking = new VisitCreateRequest(
                    id.toString(), Instant.now().plus(2, ChronoUnit.DAYS), null, null);

            Races.run(2, i -> {
                if (i == 0) {
                    visitService.schedule(buyer.getId(), booking);
                } else {
                    listings.deleteByOwner(owner.getId(), id.toString());
                }
            });

            assertThat(jdbc.queryForObject("select count(*) from visits where property_id = ? "
                    + "and status in ('scheduled', 'confirmed')", Long.class, id)).isZero();
        }
    }
}
