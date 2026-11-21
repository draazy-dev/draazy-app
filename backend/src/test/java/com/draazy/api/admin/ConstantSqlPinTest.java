package com.draazy.api.admin;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.moderation.property.PendingQueue;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Queries that moved from built text to constants return what they always did")
class ConstantSqlPinTest extends AbstractApiTest {

    @Autowired AdminMetricsRepository metrics;
    @Autowired PendingQueue pendingQueue;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;

    private User user(String mobile) {
        User u = new User(mobile, Roles.Wire.OWNER);
        u.setName("Pin " + mobile.substring(6));
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private UUID pending(User owner, String title, String createdAgo) {
        Property p = new Property(owner, title, "rent", "apartment", 28000L, "Baner", "Pune");
        p.setStatus(PropertyStatus.PENDING);
        UUID id = properties.saveAndFlush(p).getId();
        jdbc.update("update properties set created_at = now() - cast(? as interval) where id = ?", createdAgo, id);
        return id;
    }

    private long count(String sql, Object... args) {
        Long value = jdbc.queryForObject(sql, Long.class, args);
        return value == null ? 0 : value;
    }

    @Test
    @DisplayName("the pending queue lists oldest first or newest first, ties broken by id descending")
    void pendingQueueOrders() {
        User owner = user("9877720001");
        UUID oldest = pending(owner, "Pin oldest", "5 days");
        UUID middle = pending(owner, "Pin middle", "3 days");
        UUID newest = pending(owner, "Pin newest", "1 day");

        List<String> oldestFirst = pendingQueue.pending(1000, true).stream().map(PendingQueue.Row::id).toList();
        List<String> newestFirst = pendingQueue.pending(1000, false).stream().map(PendingQueue.Row::id).toList();

        assertThat(oldestFirst).containsSubsequence(oldest.toString(), middle.toString(), newest.toString());
        assertThat(newestFirst).containsSubsequence(newest.toString(), middle.toString(), oldest.toString());
        assertThat(pendingQueue.pending(2, false)).hasSize(2);
        assertThat(pendingQueue.pending(2, false).getFirst().id()).isEqualTo(newestFirst.getFirst());
    }

    @Test
    @DisplayName("countListings takes an optional status and always leaves archived listings out")
    void countListingsOptionalStatus() {
        User owner = user("9877720002");
        long all = metrics.countListings(null);
        long pendingBefore = metrics.countListings("pending");

        pending(owner, "Pin live", "1 hour");
        UUID archived = pending(owner, "Pin archived", "1 hour");
        jdbc.update("update properties set archived = true where id = ?", archived);

        assertThat(metrics.countListings(null)).isEqualTo(all + 1);
        assertThat(metrics.countListings("pending")).isEqualTo(pendingBefore + 1);
        assertThat(metrics.countListings(null)).isEqualTo(count("select count(*) from properties where archived = false"));
        assertThat(metrics.countListings("pending"))
                .isEqualTo(count("select count(*) from properties where archived = false and status = 'pending'"));
        assertThat(metrics.countListings("no-such-status")).isZero();
    }

    @Test
    @DisplayName("countUsers takes an optional IST-day window and leaves archived users out")
    void countUsersOptionalWindow() {
        long all = metrics.countUsers(null);
        long week = metrics.countUsers(7);

        jdbc.update("insert into users (mobile, role, name, joined_at, mobile_verified, archived) "
                + "values ('9877720003', 'buyer', 'Fresh', now(), true, false)");
        jdbc.update("insert into users (mobile, role, name, joined_at, mobile_verified, archived) "
                + "values ('9877720004', 'buyer', 'Old', now() - interval '400 days', true, false)");
        jdbc.update("insert into users (mobile, role, name, joined_at, mobile_verified, archived) "
                + "values ('9877720005', 'buyer', 'Gone', now(), true, true)");

        assertThat(metrics.countUsers(null)).isEqualTo(all + 2);
        assertThat(metrics.countUsers(7)).isEqualTo(week + 1);
        assertThat(metrics.countUsers(null)).isEqualTo(count("select count(*) from users where archived = false"));
    }

    @Test
    @DisplayName("the ledger and its count apply kind, search and since filters together, and each only when given")
    void ledgerFilters() {
        long total = metrics.ledgerCount(null, null, null);

        assertThat(metrics.ledger(null, null, null, 1000, 0)).hasSize((int) Math.min(total, 1000));
        assertThat(metrics.ledgerCount("no-such-kind", null, null)).isZero();
        assertThat(metrics.ledger("no-such-kind", null, null, 10, 0)).isEmpty();
        assertThat(metrics.ledgerCount(null, "%zz-no-such-party-zz%", null)).isZero();
        assertThat(metrics.ledgerCount(null, null, LocalDate.now().plusYears(1))).isZero();
        assertThat(metrics.ledger(null, null, null, 5, total)).isEmpty();
        assertThat(metrics.ledgerCount(null, null, LocalDate.of(2000, 1, 1))).isEqualTo(total);
    }
}
