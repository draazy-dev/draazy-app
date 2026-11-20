package com.draazy.api.admin.alerts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

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
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Staff SLA sweep: announce, remind, escalate")
class StaffSlaSweepTest extends AbstractApiTest {
    private static final Instant BASE = Instant.parse("2026-09-01T04:00:00Z");

    // Arrival-only rules never reach the far-future backlog sweep, so their cases anchor after the seed data.
    private static final Instant AFTER_SEED = Instant.now().truncatedTo(ChronoUnit.SECONDS).plus(Duration.ofDays(1));

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

    @Test
    @DisplayName("a customer's draft decision reaches the assignee, or the desk when nobody holds the case, every round")
    void draftDecisionReachesTheDesk() {
        User assignee = staff("9820000961", "desk:rental");
        User colleague = staff("9820000962", "desk:rental");
        User legal = staff("9820000963", "desk:legal");
        User customer = account("9820000964", Roles.Wire.OWNER);
        UUID agreement = serviceRequest(customer, "rent-agreement", "rental", "changes-requested", assignee);
        serviceRequest(customer, "legal", "legal", "approved", null);

        sweep.sweep(AFTER_SEED.plus(Duration.ofMinutes(10)));
        assertThat(types(assignee)).containsExactly("queue.draft-decision");
        assertThat(types(colleague)).isEmpty();
        assertThat(bodies(assignee)).containsExactly("Rent Agreement: changes requested");
        assertThat(bodies(legal)).containsExactly("Legal: draft approved");

        Instant secondRound = AFTER_SEED.plus(Duration.ofHours(3));
        jdbc.update("update service_requests set status_changed_at = ? where id = ?",
                Timestamp.from(secondRound), agreement);
        sweep.sweep(secondRound.plus(Duration.ofMinutes(10)));
        assertThat(types(assignee)).containsExactly("queue.draft-decision", "queue.draft-decision");
    }

    @Test
    @DisplayName("a live listing's edit re-check reaches listing moderation; a lapsed badge's renewal reaches verification")
    void liveListingRecheckAndBadgeRequest() {
        User moderator = staff("9820000971", "listingModeration");
        User verifier = staff("9820000972", "propertyVerification");
        User owner = account("9820000973", Roles.Wire.OWNER);
        Property edited = pendingListing(owner, AFTER_SEED);
        jdbc.update("""
                update properties set status = 'approved', recheck_requested_at = ?, recheck_reason = 'Price'
                 where id = ?
                """, Timestamp.from(AFTER_SEED), edited.getId());
        Property badge = pendingListing(owner, AFTER_SEED);
        jdbc.update("""
                update properties set status = 'approved', ownership_requested_at = ?, recheck_requested_at = ?,
                                      recheck_reason = ?, ownership_verified = true,
                                      ownership_verified_until = ?
                 where id = ?
                """, Timestamp.from(AFTER_SEED), Timestamp.from(AFTER_SEED), Property.OWNERSHIP_REVIEW_ITEM,
                Timestamp.from(AFTER_SEED.minus(Duration.ofDays(1))), badge.getId());

        sweep.sweep(AFTER_SEED.plus(Duration.ofMinutes(10)));

        assertThat(types(moderator)).containsExactly("queue.listing-recheck");
        assertThat(unreadLinks(moderator)).containsExactly("/admin/properties?review=" + edited.getId());
        assertThat(types(verifier)).containsExactly("queue.badge-request");
        assertThat(unreadLinks(verifier)).containsExactly("/admin/properties?review=" + badge.getId());
    }

    @Test
    @DisplayName("a flatmate post awaiting moderation is announced; a community society is announced and never chased")
    void flatmatePostAndCommunitySociety() {
        User flatmates = staff("9820000981", "flatmates");
        User societies = staff("9820000982", "societies");
        jdbc.update("""
                insert into flatmate_seeker_posts (user_id, name, budget, mod_status, created_at)
                values (?, 'Asha Patil', 15000, 'pending', ?)
                """, account("9820000983", Roles.Wire.BUYER).getId(), Timestamp.from(AFTER_SEED));
        jdbc.update("insert into societies (slug, name, source, created_at) values (?, 'Green Meadows', 'community', ?)",
                "green-meadows-" + UUID.randomUUID(), Timestamp.from(AFTER_SEED));

        sweep.sweep(AFTER_SEED.plus(Duration.ofMinutes(10)));
        assertThat(types(flatmates)).containsExactly("queue.flatmate-post");
        assertThat(types(societies)).containsExactly("queue.community-society");

        sweep.sweep(AFTER_SEED.plus(Duration.ofDays(30)));
        assertThat(types(societies)).hasSize(1);
    }

    @Test
    @DisplayName("a suspended holder is skipped, so the item falls back to the escalation audience")
    void suspendedHolderIsSkipped() {
        User suspended = staff("9820000991", "desk:valuation");
        suspended.setStatus("suspended");
        users.saveAndFlush(suspended);
        jdbc.update("""
                update back_office_permissions set permissions = '[]'::jsonb
                 where permissions @> '["desk:valuation"]'::jsonb and user_id <> ?
                """, suspended.getId());
        User manager = account("9820000992", Roles.Wire.MANAGER);
        jdbc.update("""
                insert into tickets (id, subject, team, priority, status, created_at, updated_at)
                values (?, 'Valuation for Aundh flat', 'valuation', 'medium', 'open', ?, ?)
                """, UUID.randomUUID(), Timestamp.from(AFTER_SEED), Timestamp.from(AFTER_SEED));

        sweep.sweep(AFTER_SEED.plus(Duration.ofMinutes(10)));

        assertThat(types(suspended)).isEmpty();
        assertThat(types(manager)).containsExactly("queue.desk-pickup");
    }

    @Test
    @DisplayName("every rule's query runs, since the sweep only logs a failing rule")
    void everyRuleQueryRuns() {
        StaffSlaRule.CATALOGUE.forEach(rule ->
                assertThatCode(() -> jdbc.queryForList(rule.sql())).as(rule.name()).doesNotThrowAnyException());
    }

    private UUID serviceRequest(User requester, String type, String team, String status, User assignee) {
        return jdbc.queryForObject("""
                insert into service_requests (requester_id, type, team, status, assignee_id, status_changed_at)
                values (?, ?, ?, ?, ?, ?) returning id
                """, UUID.class, requester.getId(), type, team, status,
                assignee == null ? null : assignee.getId(), Timestamp.from(AFTER_SEED));
    }

    private List<String> bodies(User user) {
        return jdbc.queryForList("select body from notifications where user_id = ?", String.class, user.getId());
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
