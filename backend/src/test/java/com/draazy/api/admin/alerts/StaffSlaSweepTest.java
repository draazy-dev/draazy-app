package com.draazy.api.admin.alerts;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Staff SLA sweep: announce, remind, escalate")
class StaffSlaSweepTest extends AbstractApiTest {
    private static final Instant BASE = Instant.parse("2026-09-01T04:00:00Z");

    @Autowired
    StaffSlaSweep sweep;
    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;

    @BeforeEach
    void absorbExistingBacklog() {
        sweep.sweep(BASE.plus(Duration.ofDays(3650)));
    }

    @Test
    @DisplayName("a pending listing is announced, reminded at 24h and escalated to managers at 36h, once each")
    void listingLifecycle() {
        User moderator = staff("9820000901", "listingModeration");
        User bystander = staff("9820000902", "kyc");
        User manager = account("9820000903", Roles.Wire.MANAGER);
        Property listing = pendingListing(account("9820000904", Roles.Wire.OWNER));

        sweep.sweep(BASE.plus(Duration.ofMinutes(10)));
        sweep.sweep(BASE.plus(Duration.ofMinutes(25)));
        assertThat(types(moderator)).containsExactly("queue.listing-review");
        assertThat(types(bystander)).isEmpty();
        assertThat(types(manager)).isEmpty();

        sweep.sweep(BASE.plus(Duration.ofHours(24)));
        sweep.sweep(BASE.plus(Duration.ofHours(25)));
        assertThat(types(moderator)).containsExactly("queue.listing-review", "sla.listing-review");

        sweep.sweep(BASE.plus(Duration.ofHours(36)));
        assertThat(types(moderator)).hasSize(2);
        assertThat(types(manager)).containsExactly("escalation.listing-review");
        assertThat(jdbc.queryForObject("select link from notifications where user_id = ?", String.class,
                manager.getId())).isEqualTo("/admin/properties?review=" + listing.getId());
    }

    @Test
    @DisplayName("an item first seen already overdue escalates without a late announcement or reminder")
    void overdueOnFirstSightOnlyEscalates() {
        User moderator = staff("9820000911", "listingModeration");
        User manager = account("9820000912", Roles.Wire.MANAGER);
        pendingListing(account("9820000913", Roles.Wire.OWNER));

        sweep.sweep(BASE.plus(Duration.ofHours(40)));
        sweep.sweep(BASE.plus(Duration.ofHours(41)));

        assertThat(types(moderator)).isEmpty();
        assertThat(types(manager)).containsExactly("escalation.listing-review");
    }

    @Test
    @DisplayName("an unassigned desk ticket reaches only that desk's staff, and escalates to admins with no manager")
    void deskRoutingAndAdminFallback() {
        User loans = staff("9820000921", "desk:loans");
        User legal = staff("9820000922", "desk:legal");
        User admin = account("9820000923", Roles.Wire.ADMIN);
        jdbc.update("update users set archived = true where role = 'manager'");
        jdbc.update("""
                insert into tickets (id, subject, team, priority, status, created_at, updated_at)
                values (?, 'Home loan for Baner flat', 'loans', 'medium', 'open', ?, ?)
                """, UUID.randomUUID(), Timestamp.from(BASE), Timestamp.from(BASE));

        sweep.sweep(BASE.plus(Duration.ofMinutes(5)));
        assertThat(types(loans)).containsExactly("queue.desk-pickup");
        assertThat(types(legal)).isEmpty();

        sweep.sweep(BASE.plus(Duration.ofHours(8)));
        assertThat(types(admin)).containsExactly("escalation.desk-pickup");
        assertThat(jdbc.queryForObject("select link from notifications where user_id = ?", String.class,
                admin.getId())).isEqualTo("/admin/home-loans");
    }

    @Test
    @DisplayName("an answered support ticket stops counting, and the customer's follow-up re-arms it")
    void answeredSupportTicketIsQuietUntilTheCustomerWritesAgain() {
        User agent = staff("9820000931", "support");
        User customer = account("9820000932", Roles.Wire.BUYER);
        UUID ticket = UUID.randomUUID();
        jdbc.update("""
                insert into support_tickets (id, user_id, subject, staff_unread, created_at, updated_at)
                values (?, ?, 'Refund not received', true, ?, ?)
                """, ticket, customer.getId(), Timestamp.from(BASE), Timestamp.from(BASE));

        sweep.sweep(BASE.plus(Duration.ofMinutes(5)));
        assertThat(types(agent)).containsExactly("queue.support-ticket");

        jdbc.update("update support_tickets set staff_unread = false where id = ?", ticket);
        sweep.sweep(BASE.plus(Duration.ofHours(30)));
        assertThat(types(agent)).hasSize(1);

        Instant followUp = BASE.plus(Duration.ofHours(40));
        jdbc.update("""
                insert into support_ticket_messages (ticket_id, author_id, body, created_at)
                values (?, ?, 'Any update?', ?)
                """, ticket, customer.getId(), Timestamp.from(followUp));
        jdbc.update("update support_tickets set staff_unread = true where id = ?", ticket);
        sweep.sweep(followUp.plus(Duration.ofHours(24)));
        assertThat(types(agent)).containsExactly("queue.support-ticket", "sla.support-ticket");
    }

    @Test
    @DisplayName("a live KYC claim sends the reminder to the claimer alone; a lapsed claim goes to the desk")
    void kycReminderFollowsALiveClaim() {
        User claimer = staff("9820000941", "kyc");
        User colleague = staff("9820000942", "kyc");
        pendingCheck(account("9820000943", Roles.Wire.BUYER), claimer, "now()");
        pendingCheck(account("9820000944", Roles.Wire.BUYER), claimer, "now() - interval '31 minutes'");

        sweep.sweep(BASE.plus(Duration.ofHours(48)));

        assertThat(types(claimer)).containsExactly("sla.kyc-review");
        assertThat(jdbc.queryForObject("select title from notifications where user_id = ?", String.class,
                colleague.getId())).isEqualTo("Waiting 2d+: ID check");
    }

    private void pendingCheck(User applicant, User claimer, String claimedAt) {
        jdbc.update("""
                insert into identity_verifications (user_id, status, doc_type, consent_at, submitted_at,
                                                    claimed_by, claimed_at)
                values (?, 'pending', 'aadhaar', ?, ?, ?, %s)
                """.formatted(claimedAt), applicant.getId(), Timestamp.from(BASE), Timestamp.from(BASE),
                claimer.getId());
    }

    @Test
    @DisplayName("a resolved item clears its own alert, and a batched alert clears once its queue is empty")
    void resolvedItemsClearTheirAlerts() {
        User moderator = staff("9820000951", "listingModeration");
        User owner = account("9820000952", Roles.Wire.OWNER);
        Property first = pendingListing(owner, BASE);
        sweep.sweep(BASE.plus(Duration.ofMinutes(10)));
        Property second = pendingListing(owner, BASE.plus(Duration.ofHours(1)));
        sweep.sweep(BASE.plus(Duration.ofMinutes(70)));
        Property third = pendingListing(owner, BASE.plus(Duration.ofHours(2)));
        Property fourth = pendingListing(owner, BASE.plus(Duration.ofHours(2)));
        sweep.sweep(BASE.plus(Duration.ofMinutes(130)));

        archive(first);
        archive(third);
        sweep.sweep(BASE.plus(Duration.ofMinutes(140)));
        assertThat(unreadLinks(moderator)).containsExactlyInAnyOrder(
                "/admin/properties?review=" + second.getId(), "/admin/properties");

        archive(second);
        archive(fourth);
        sweep.sweep(BASE.plus(Duration.ofMinutes(150)));
        assertThat(unreadLinks(moderator)).isEmpty();
        assertThat(types(moderator)).hasSize(3);
    }

    private void archive(Property listing) {
        jdbc.update("update properties set archived = true where id = ?", listing.getId());
    }

    private List<String> unreadLinks(User user) {
        return jdbc.queryForList("select link from notifications where user_id = ? and read = false",
                String.class, user.getId());
    }

    private List<String> types(User user) {
        return jdbc.queryForList("select type from notifications where user_id = ? order by type",
                String.class, user.getId());
    }

    private User account(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("User " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private User staff(String mobile, String function) {
        User saved = account(mobile, Roles.Wire.STAFF);
        jdbc.update("insert into back_office_permissions (user_id, permissions) values (?::uuid, ?::jsonb)",
                saved.getId().toString(), "[\"" + function + "\"]");
        return saved;
    }

    private Property pendingListing(User owner) {
        return pendingListing(owner, BASE);
    }

    private Property pendingListing(User owner, Instant createdAt) {
        Property p = new Property(owner, "2BHK in Wakad", "rent", "apartment", 32000L, "Wakad", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus(PropertyStatus.PENDING);
        Property saved = properties.saveAndFlush(p);
        jdbc.update("update properties set created_at = ?, resubmitted_at = null where id = ?",
                Timestamp.from(createdAt), saved.getId());
        return saved;
    }
}
