package com.draazy.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.engagement.notification.WaitingDigestService;
import com.draazy.api.identity.user.User;
import com.draazy.api.jobs.ScheduledJob.Group;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.provider.ProviderCalls;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.AopProxyUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.ReflectionTestUtils;

@DisplayName("DAYTIME engagement jobs run end to end against Postgres")
class DaytimeEngagementJobsQaTest extends AbstractJobQaTest {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH);

    @Autowired
    private PropertyRepository properties;

    @Autowired
    private WaitingDigestService digest;

    private Object realMessenger;

    @Override
    protected String mobilePrefix() {
        return "97915040";
    }

    @AfterEach
    void restoreMessengerAndLedger() {
        if (realMessenger != null) {
            ReflectionTestUtils.setField(digestTarget(), "messenger", realMessenger);
            realMessenger = null;
        }
        jdbc.update("delete from provider_call where operation = ?", DecisionMessenger.WAITING_DIGEST);
    }

    private User person(int n) {
        User person = user(String.format("%02d", n), "buyer");
        jdbc.update("update users set verified = true where id = ?", person.getId());
        return person;
    }

    private static Timestamp ts(Instant at) {
        return Timestamp.from(at);
    }

    private static Instant fromNow(Duration d) {
        return Instant.now().plus(d);
    }

    private UUID insertId(String sql, Object... args) {
        return jdbc.queryForObject(sql + " returning id", UUID.class, args);
    }

    private void set(String table, UUID id, String assignments, Object... args) {
        List<Object> all = new ArrayList<>(List.of(args));
        all.add(id);
        jdbc.update("update " + table + " set " + assignments + " where id = ?", all.toArray());
    }

    private List<String> noteTypes(User u) {
        return jdbc.queryForList("select type from notifications where user_id = ? order by created_at, type",
                String.class, u.getId());
    }

    private List<Map<String, Object>> notes(User u) {
        return jdbc.queryForList("select type, title, body, link from notifications where user_id = ?"
                + " order by created_at, type", u.getId());
    }

    private long noteCount() {
        return jdbc.queryForObject("select count(*) from notifications n join users u on u.id = n.user_id"
                + " where u.mobile like ?", Long.class, mobilePrefix() + "%");
    }

    private UUID room(User host, String modStatus) {
        return insertId("insert into flatmate_rooms (host_id, room_type, locality, budget, mod_status)"
                + " values (?, 'Private room', 'Baner', 15000, ?)", host.getId(), modStatus);
    }

    private UUID group(User host, String modStatus) {
        return insertId("insert into flatmate_groups (host_id, title, locality, rent, mod_status)"
                + " values (?, 'QA group', 'Baner', 30000, ?)", host.getId(), modStatus);
    }

    private UUID seekerPost(User seeker, String modStatus) {
        return insertId("insert into flatmate_seeker_posts (user_id, name, budget, mod_status)"
                + " values (?, 'QA seeker', 20000, ?)", seeker.getId(), modStatus);
    }

    private UUID badgedListing(User owner, String status, String locality) {
        Property p = new Property(owner, "QA flat " + UUID.randomUUID(), "rent", "apartment", 25000L, locality,
                "Pune");
        p.setStatus(status);
        p.verifyOwnership(Instant.now(), null);
        return properties.saveAndFlush(p).getId();
    }

    private UUID listing(User owner, String status, String locality) {
        Property p = new Property(owner, "QA flat " + UUID.randomUUID(), "rent", "apartment", 25000L, locality,
                "Pune");
        p.setStatus(status);
        return properties.saveAndFlush(p).getId();
    }

    private void lapseIn(String table, UUID id, Duration fromNow, boolean reminded) {
        set(table, id, "active_until = ?, expiry_reminded = ?", ts(fromNow(fromNow)), reminded);
    }

    private String column(String table, UUID id, String column) {
        return jdbc.queryForObject("select " + column + "::text from " + table + " where id = ?", String.class, id);
    }

    @Test
    @DisplayName("flatmate posts are reminded once inside the 3-day window, then expired once, per owner")
    void flatmateReminderAndExpiryLifecycle() {
        User hostRoomSoon = person(1);
        User hostRoomEdge = person(2);
        User hostRoomFar = person(3);
        User hostRoomReminded = person(4);
        User hostRoomPending = person(5);
        User hostRoomArchived = person(6);
        User hostRoomFlagged = person(7);
        User hostRoomLapsedReminded = person(8);
        User hostRoomLapsedFresh = person(9);
        User hostRoomLapsedArchived = person(10);
        User hostRoomLapsedPending = person(11);
        User hostGroupSoon = person(12);
        User hostGroupLapsed = person(13);
        User seekerSoon = person(14);
        User seekerLapsed = person(15);
        User seekerFar = person(16);

        UUID soon = room(hostRoomSoon, "live");
        lapseIn("flatmate_rooms", soon, Duration.ofDays(2), false);
        UUID edgeIn = room(hostRoomEdge, "approved");
        lapseIn("flatmate_rooms", edgeIn, Duration.ofDays(3).minusHours(1), false);
        UUID far = room(hostRoomFar, "live");
        lapseIn("flatmate_rooms", far, Duration.ofDays(3).plusHours(1), false);
        UUID alreadyReminded = room(hostRoomReminded, "live");
        lapseIn("flatmate_rooms", alreadyReminded, Duration.ofDays(2), true);
        UUID pending = room(hostRoomPending, "pending");
        lapseIn("flatmate_rooms", pending, Duration.ofDays(1), false);
        UUID archived = room(hostRoomArchived, "live");
        lapseIn("flatmate_rooms", archived, Duration.ofDays(1), false);
        set("flatmate_rooms", archived, "archived = true");
        UUID flagged = room(hostRoomFlagged, "flagged");
        lapseIn("flatmate_rooms", flagged, Duration.ofDays(1), false);
        UUID lapsedReminded = room(hostRoomLapsedReminded, "live");
        lapseIn("flatmate_rooms", lapsedReminded, Duration.ofHours(-1), true);
        UUID lapsedFresh = room(hostRoomLapsedFresh, "approved");
        lapseIn("flatmate_rooms", lapsedFresh, Duration.ofHours(-5), false);
        UUID lapsedArchived = room(hostRoomLapsedArchived, "live");
        lapseIn("flatmate_rooms", lapsedArchived, Duration.ofHours(-5), true);
        set("flatmate_rooms", lapsedArchived, "archived = true");
        UUID lapsedPending = room(hostRoomLapsedPending, "pending");
        lapseIn("flatmate_rooms", lapsedPending, Duration.ofDays(-2), true);
        UUID groupSoon = group(hostGroupSoon, "live");
        lapseIn("flatmate_groups", groupSoon, Duration.ofDays(1), false);
        UUID groupLapsed = group(hostGroupLapsed, "approved");
        lapseIn("flatmate_groups", groupLapsed, Duration.ofMinutes(-30), true);
        UUID postSoon = seekerPost(seekerSoon, "live");
        lapseIn("flatmate_seeker_posts", postSoon, Duration.ofDays(2), false);
        UUID postLapsed = seekerPost(seekerLapsed, "approved");
        lapseIn("flatmate_seeker_posts", postLapsed, Duration.ofMinutes(-30), true);
        UUID postFar = seekerPost(seekerFar, "live");
        lapseIn("flatmate_seeker_posts", postFar, Duration.ofDays(20), false);

        runGroup(Group.DAYTIME);
        assertThat(touched("flatmate-post-reminders")).isEqualTo(5);
        runGroup(Group.HOURLY);
        assertThat(touched("flatmate-post-expiry")).isEqualTo(4);

        assertThat(noteTypes(hostRoomSoon)).containsExactly("flatmate.room.expiring");
        assertThat(noteTypes(hostRoomEdge)).containsExactly("flatmate.room.expiring");
        assertThat(noteTypes(hostGroupSoon)).containsExactly("flatmate.group.expiring");
        assertThat(noteTypes(seekerSoon)).containsExactly("flatmate.post.expiring");
        assertThat(noteTypes(hostRoomFar)).isEmpty();
        assertThat(noteTypes(hostRoomReminded)).isEmpty();
        assertThat(noteTypes(hostRoomPending)).isEmpty();
        assertThat(noteTypes(hostRoomArchived)).isEmpty();
        assertThat(noteTypes(hostRoomFlagged)).isEmpty();
        assertThat(noteTypes(seekerFar)).isEmpty();
        assertThat(noteTypes(hostRoomLapsedReminded)).containsExactly("flatmate.room.expired");
        assertThat(noteTypes(hostRoomLapsedFresh)).containsExactly("flatmate.room.expiring", "flatmate.room.expired");
        assertThat(noteTypes(hostRoomLapsedArchived)).isEmpty();
        assertThat(noteTypes(hostRoomLapsedPending)).isEmpty();
        assertThat(noteTypes(hostGroupLapsed)).containsExactly("flatmate.group.expired");
        assertThat(noteTypes(seekerLapsed)).containsExactly("flatmate.post.expired");

        for (UUID id : List.of(soon, edgeIn, far, pending, archived, flagged, lapsedArchived, lapsedPending)) {
            assertThat(column("flatmate_rooms", id, "mod_status")).isNotEqualTo("expired");
        }
        assertThat(column("flatmate_rooms", soon, "expiry_reminded")).isEqualTo("true");
        assertThat(column("flatmate_rooms", edgeIn, "expiry_reminded")).isEqualTo("true");
        assertThat(column("flatmate_rooms", far, "expiry_reminded")).isEqualTo("false");
        assertThat(column("flatmate_rooms", pending, "expiry_reminded")).isEqualTo("false");
        assertThat(column("flatmate_rooms", archived, "expiry_reminded")).isEqualTo("false");
        assertThat(column("flatmate_seeker_posts", postFar, "expiry_reminded")).isEqualTo("false");
        assertThat(column("flatmate_rooms", alreadyReminded, "mod_status")).isEqualTo("live");

        assertThat(column("flatmate_rooms", lapsedReminded, "mod_status")).isEqualTo("expired");
        assertThat(column("flatmate_rooms", lapsedReminded, "expired_from")).isEqualTo("live");
        assertThat(column("flatmate_rooms", lapsedFresh, "mod_status")).isEqualTo("expired");
        assertThat(column("flatmate_rooms", lapsedFresh, "expired_from")).isEqualTo("approved");
        assertThat(column("flatmate_groups", groupLapsed, "mod_status")).isEqualTo("expired");
        assertThat(column("flatmate_groups", groupLapsed, "expired_from")).isEqualTo("approved");
        assertThat(column("flatmate_seeker_posts", postLapsed, "mod_status")).isEqualTo("expired");
        assertThat(column("flatmate_seeker_posts", postLapsed, "expired_from")).isEqualTo("approved");
        assertThat(column("flatmate_rooms", lapsedArchived, "mod_status")).isEqualTo("live");
        assertThat(column("flatmate_rooms", lapsedPending, "mod_status")).isEqualTo("pending");
        assertThat(column("flatmate_seeker_posts", postSoon, "mod_status")).isEqualTo("live");

        long before = noteCount();
        runGroup(Group.DAYTIME);
        assertThat(touched("flatmate-post-reminders")).isZero();
        runGroup(Group.HOURLY);
        assertThat(touched("flatmate-post-expiry")).isZero();
        assertThat(noteCount()).isEqualTo(before);
    }

    @Test
    @DisplayName("a post past its lifetime stops being served after the next hourly run")
    void lapsedPostLeavesTheBoardWithinAnHour() throws Exception {
        User host = person(24);
        User viewer = person(25);
        UUID standing = room(host, "live");
        lapseIn("flatmate_rooms", standing, Duration.ofDays(5), false);
        UUID lapsed = room(host, "live");
        lapseIn("flatmate_rooms", lapsed, Duration.ofHours(-5), true);

        runGroup(Group.HOURLY);

        assertThat(touched("flatmate-post-expiry")).isEqualTo(1);
        mvc.perform(get(Routes.Flatmates.ROOM_BY_ID, standing).header("Authorization", bearer(viewer)))
                .andExpect(status().isOk());
        mvc.perform(get(Routes.Flatmates.ROOM_BY_ID, lapsed).header("Authorization", bearer(viewer)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a post reminded on an earlier run expires later without a second reminder")
    void remindedPostLapsesLaterWithoutAnotherReminder() {
        User host = person(21);
        UUID id = room(host, "live");
        lapseIn("flatmate_rooms", id, Duration.ofDays(2), false);

        runGroup(Group.DAYTIME);
        assertThat(noteTypes(host)).containsExactly("flatmate.room.expiring");

        lapseIn("flatmate_rooms", id, Duration.ofHours(-1), true);
        runGroup(Group.DAYTIME);
        assertThat(touched("flatmate-post-reminders")).isZero();
        runGroup(Group.HOURLY);

        assertThat(touched("flatmate-post-expiry")).isEqualTo(1);
        assertThat(noteTypes(host)).containsExactly("flatmate.room.expiring", "flatmate.room.expired");
        assertThat(column("flatmate_rooms", id, "mod_status")).isEqualTo("expired");

        runGroup(Group.DAYTIME);
        runGroup(Group.HOURLY);
        assertThat(noteTypes(host)).hasSize(2);
    }

    @Test
    @DisplayName("a daily run reminds every post that enters the 3-day window since the previous run")
    void dailyTickNeverSkipsAPostBetweenRuns() {
        User host = person(22);
        User other = person(23);
        UUID dayThree = room(host, "live");
        lapseIn("flatmate_rooms", dayThree, Duration.ofDays(3).minusMinutes(5), false);
        UUID dayFour = room(other, "live");
        lapseIn("flatmate_rooms", dayFour, Duration.ofDays(3).plusMinutes(5), false);

        runGroup(Group.DAYTIME);
        assertThat(noteTypes(host)).containsExactly("flatmate.room.expiring");
        assertThat(noteTypes(other)).isEmpty();

        lapseIn("flatmate_rooms", dayFour, Duration.ofDays(2).plusHours(1), false);
        runGroup(Group.DAYTIME);
        assertThat(noteTypes(other)).containsExactly("flatmate.room.expiring");
        assertThat(noteTypes(host)).hasSize(1);
    }

    @Test
    @DisplayName("owner-tier badges follow the linked listing down: tier falls back and live posts return to review")
    void ownerTierReconcilesDownward() {
        User owner = person(30);
        UUID approvedListing = badgedListing(owner, "approved", "Baner");
        UUID pendingListing = listing(owner, "pending", "Baner");
        UUID archivedListing = listing(owner, "approved", "Baner");
        jdbc.update("update properties set archived = true where id = ?", archivedListing);
        String ownerClaim = "prop:";

        User standing = person(31);
        User withdrawnListing = person(32);
        User archivedFlat = person(33);
        User dangling = person(34);
        User unparseable = person(35);
        User archivedPost = person(36);
        User notPropertyClaim = person(37);
        User groupStale = person(38);
        User groupStanding = person(39);

        UUID rStanding = ownerRoom(standing, ownerClaim + approvedListing, "live", false);
        UUID rPending = ownerRoom(withdrawnListing, ownerClaim + pendingListing, "live", false);
        UUID rArchived = ownerRoom(archivedFlat, ownerClaim + archivedListing, "live", true);
        UUID rDangling = ownerRoom(dangling, ownerClaim + UUID.randomUUID(), "approved", false);
        UUID rGarbage = ownerRoom(unparseable, "prop:not-a-uuid", "live", false);
        UUID rArchivedPost = ownerRoom(archivedPost, ownerClaim + pendingListing, "live", false);
        set("flatmate_rooms", rArchivedPost, "archived = true");
        UUID rOtherFingerprint = ownerRoom(notPropertyClaim, "addr:baner-12", "live", false);
        UUID gStale = ownerGroup(groupStale, ownerClaim + pendingListing, "live", true);
        UUID gStanding = ownerGroup(groupStanding, ownerClaim + approvedListing, "live", false);

        runGroup(Group.DAYTIME);

        assertThat(touched("flatmate-owner-tier")).isEqualTo(5);
        assertTier("flatmate_rooms", rStanding, "owner", "live");
        assertTier("flatmate_rooms", rPending, "identity", "pending");
        assertTier("flatmate_rooms", rArchived, "tenant", "pending");
        assertTier("flatmate_rooms", rDangling, "identity", "approved");
        assertTier("flatmate_rooms", rGarbage, "identity", "pending");
        assertTier("flatmate_rooms", rArchivedPost, "owner", "live");
        assertTier("flatmate_rooms", rOtherFingerprint, "owner", "live");
        assertTier("flatmate_groups", gStale, "tenant", "pending");
        assertTier("flatmate_groups", gStanding, "owner", "live");

        assertThat(notes(withdrawnListing)).singleElement().satisfies(n -> assertThat(n)
                .containsEntry("type", "flatmate.moderated.held")
                .containsEntry("link", "/flatmates/room/" + rPending));
        assertThat(notes(groupStale)).singleElement().satisfies(n -> assertThat(n)
                .containsEntry("type", "flatmate.moderated.held")
                .containsEntry("link", "/flatmates/group/" + gStale));
        assertThat(noteTypes(archivedFlat)).containsExactly("flatmate.moderated.held");
        assertThat(noteTypes(unparseable)).containsExactly("flatmate.moderated.held");
        assertThat(noteTypes(dangling)).isEmpty();
        assertThat(noteTypes(standing)).isEmpty();
        assertThat(noteTypes(archivedPost)).isEmpty();
        assertThat(noteTypes(notPropertyClaim)).isEmpty();
        assertThat(noteTypes(groupStanding)).isEmpty();

        long before = noteCount();
        runGroup(Group.DAYTIME);
        assertThat(touched("flatmate-owner-tier")).isZero();
        assertThat(noteCount()).isEqualTo(before);
    }

    @Test
    @DisplayName("a listing that stays approved keeps the owner badge across repeated runs")
    void ownerTierIsStableWhileTheListingStands() {
        User owner = person(40);
        User host = person(41);
        UUID listing = badgedListing(owner, "approved", "Baner");
        UUID room = ownerRoom(host, "prop:" + listing, "live", false);

        runGroup(Group.DAYTIME);
        runGroup(Group.DAYTIME);

        assertTier("flatmate_rooms", room, "owner", "live");
        assertThat(touched("flatmate-owner-tier")).isZero();
        assertThat(noteTypes(host)).isEmpty();
    }

    @Test
    @DisplayName("an expired owner-tier post whose listing is gone cannot be renewed straight back to live")
    void expiredOwnerTierPostDoesNotComeBackLive() {
        User host = person(42);
        UUID room = ownerRoom(host, "prop:" + UUID.randomUUID(), "expired", false);
        set("flatmate_rooms", room, "expired_from = 'live'");

        runGroup(Group.DAYTIME);

        assertThat(column("flatmate_rooms", room, "verification_tier")).isEqualTo("identity");
        String mod = column("flatmate_rooms", room, "mod_status");
        String restoresTo = column("flatmate_rooms", room, "expired_from");
        assertThat("expired".equals(mod) && "live".equals(restoresTo)).isFalse();
    }

    private UUID ownerRoom(User host, String fingerprint, String modStatus, boolean agreementDeclared) {
        UUID id = room(host, modStatus);
        set("flatmate_rooms", id, "verification_tier = 'owner', address_fingerprint = ?, agreement_declared = ?",
                fingerprint, agreementDeclared);
        return id;
    }

    private UUID ownerGroup(User host, String fingerprint, String modStatus, boolean agreementDeclared) {
        UUID id = group(host, modStatus);
        set("flatmate_groups", id, "verification_tier = 'owner', address_fingerprint = ?, agreement_declared = ?",
                fingerprint, agreementDeclared);
        return id;
    }

    private void assertTier(String table, UUID id, String tier, String modStatus) {
        assertThat(column(table, id, "verification_tier")).as("%s tier", id).isEqualTo(tier);
        assertThat(column(table, id, "mod_status")).as("%s mod_status", id).isEqualTo(modStatus);
    }

    private UUID review(String kind, UUID target, User host, String tier, String status, boolean consent,
            LocalDate validTill, UUID tenancyProperty) {
        return insertId("insert into flatmate_reviews (kind, room_id, group_id, host_id, tier, status, owner_consent,"
                + " agreement_valid_till, tenancy_property_id, reason)"
                + " values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", kind,
                "room".equals(kind) ? target : null, "group".equals(kind) ? target : null, host.getId(), tier,
                status, consent, validTill, tenancyProperty, "rejected".equals(status) ? "earlier verdict" : null);
    }

    private UUID tenantRoom(User host) {
        UUID id = room(host, "approved");
        set("flatmate_rooms", id, "verification_tier = 'tenant', flag_for_review = true");
        return id;
    }

    @Test
    @DisplayName("an approved badge whose agreement ended is withdrawn and the host told, once")
    void lapsedAgreementBadgeIsWithdrawn() {
        LocalDate today = LocalDate.now(PlatformTime.IST);
        User lapsed = person(50);
        User endsToday = person(51);
        User noEndDate = person(52);
        User endsTomorrow = person(53);
        User pendingPast = person(54);
        User lapsedGroupHost = person(55);
        User editedSince = person(56);
        User alreadyRejected = person(57);

        UUID lapsedRoom = tenantRoom(lapsed);
        UUID lapsedReview = review("room", lapsedRoom, lapsed, "tenant", "approved", true, today.minusDays(1), null);
        UUID todayRoom = tenantRoom(endsToday);
        UUID todayReview = review("room", todayRoom, endsToday, "tenant", "approved", true, today, null);
        UUID noDateRoom = tenantRoom(noEndDate);
        UUID noDateReview = review("room", noDateRoom, noEndDate, "tenant", "approved", true, null, null);
        UUID tomorrowRoom = tenantRoom(endsTomorrow);
        UUID tomorrowReview = review("room", tomorrowRoom, endsTomorrow, "tenant", "approved", true,
                today.plusDays(1), null);
        UUID pendingRoom = tenantRoom(pendingPast);
        UUID pendingReview = review("room", pendingRoom, pendingPast, "tenant", "pending", false,
                today.minusDays(30), null);
        UUID lapsedGroup = group(lapsedGroupHost, "approved");
        set("flatmate_groups", lapsedGroup, "verification_tier = 'tenant'");
        UUID groupReview = review("group", lapsedGroup, lapsedGroupHost, "tenant", "approved", true,
                today.minusDays(40), null);
        UUID editedRoom = room(editedSince, "approved");
        UUID editedReview = review("room", editedRoom, editedSince, "tenant", "approved", true, today.minusDays(2),
                null);
        UUID rejectedRoom = tenantRoom(alreadyRejected);
        UUID rejectedReview = review("room", rejectedRoom, alreadyRejected, "tenant", "rejected", true,
                today.minusDays(5), null);

        runGroup(Group.DAYTIME);

        assertThat(touched("flatmate-agreement-expiry")).isEqualTo(3);
        assertThat(column("flatmate_reviews", lapsedReview, "status")).isEqualTo("rejected");
        assertThat(column("flatmate_reviews", lapsedReview, "reason"))
                .contains("lapsed on " + today.minusDays(1));
        assertThat(column("flatmate_reviews", lapsedReview, "decided_by")).isNull();
        assertThat(column("flatmate_rooms", lapsedRoom, "verification_tier")).isEqualTo("identity");
        assertThat(column("flatmate_rooms", lapsedRoom, "mod_status")).isEqualTo("approved");
        assertThat(notes(lapsed)).singleElement().satisfies(n -> assertThat(n)
                .containsEntry("type", "flatmate.review.expired")
                .containsEntry("link", "/flatmates/room/" + lapsedRoom)
                .containsEntry("body", column("flatmate_reviews", lapsedReview, "reason")));

        assertThat(column("flatmate_reviews", groupReview, "status")).isEqualTo("rejected");
        assertThat(column("flatmate_groups", lapsedGroup, "verification_tier")).isEqualTo("identity");
        assertThat(noteTypes(lapsedGroupHost)).containsExactly("flatmate.review.expired");
        assertThat(column("flatmate_reviews", editedReview, "status")).isEqualTo("rejected");
        assertThat(column("flatmate_rooms", editedRoom, "verification_tier")).isEqualTo("identity");
        assertThat(noteTypes(editedSince)).containsExactly("flatmate.review.expired");

        for (UUID untouchedReview : List.of(todayReview, noDateReview, tomorrowReview)) {
            assertThat(column("flatmate_reviews", untouchedReview, "status")).isEqualTo("approved");
        }
        for (UUID untouchedRoom : List.of(todayRoom, noDateRoom, tomorrowRoom, pendingRoom, rejectedRoom)) {
            assertThat(column("flatmate_rooms", untouchedRoom, "verification_tier")).isEqualTo("tenant");
        }
        assertThat(column("flatmate_reviews", pendingReview, "status")).isEqualTo("pending");
        assertThat(column("flatmate_reviews", rejectedReview, "reason")).isEqualTo("earlier verdict");
        for (User quiet : List.of(endsToday, noEndDate, endsTomorrow, pendingPast, alreadyRejected)) {
            assertThat(noteTypes(quiet)).isEmpty();
        }

        long before = noteCount();
        runGroup(Group.DAYTIME);
        assertThat(touched("flatmate-agreement-expiry")).isZero();
        assertThat(noteCount()).isEqualTo(before);
    }

    private UUID registeredAgreement(User owner, UUID property, String tenantMobile, String status, UUID verifiedBy) {
        UUID request = insertId("insert into service_requests (requester_id, type, team, status)"
                + " values (?, 'rent-agreement', 'rental', 'new')", owner.getId());
        UUID document = insertId("insert into documents (property_id) values (?)", property);
        return insertId("insert into rent_agreements (property_id, owner_id, tenant_mobile, status,"
                + " service_request_id, final_document_id, verified_by) values (?, ?, ?, ?, ?, ?, ?)",
                property, owner.getId(), tenantMobile, status, request, document, verifiedBy);
    }

    private UUID societyId(int offset) {
        return jdbc.queryForObject("select id from societies order by id limit 1 offset ?", UUID.class, offset);
    }

    @Test
    @DisplayName("consented tenant claims are auto-approved only against a verified registered agreement that matches")
    void draazyRegisteredAgreementsApproveOnlyWhenEveryGatePasses() {
        LocalDate today = LocalDate.now(PlatformTime.IST);
        User landlord = person(60);
        User staff = person(61);
        UUID baner = listing(landlord, "approved", "Baner");
        UUID kothrud = listing(landlord, "approved", "Kothrud");
        UUID society1 = societyId(0);
        UUID society2 = societyId(1);
        UUID inSociety1 = listing(landlord, "approved", "Baner");
        UUID inSociety2 = listing(landlord, "approved", "Baner");
        jdbc.update("update properties set society_id = ? where id = ?", society1, inSociety1);
        jdbc.update("update properties set society_id = ? where id = ?", society2, inSociety2);

        User localityMatch = person(62);
        User wrongLocality = person(63);
        User noConsent = person(64);
        User unverified = person(65);
        User someoneElsesAgreement = person(66);
        User draftAgreement = person(67);
        User endedAgreement = person(68);
        User wrongSociety = person(69);
        User societyMatch = person(70);
        User groupHost = person(71);
        User noClaimedProperty = person(72);
        User identityTier = person(73);
        User validForever = person(74);
        User stranger = person(75);
        User noIdentity = person(76);
        jdbc.update("update users set verified = false where id = ?", noIdentity.getId());

        UUID mOk = tenantRoom(localityMatch);
        UUID rOk = review("room", mOk, localityMatch, "tenant", "pending", true, null, baner);
        registeredAgreement(landlord, baner, localityMatch.getMobile(), "registered", staff.getId());

        UUID mWrongLocality = tenantRoom(wrongLocality);
        UUID rWrongLocality = review("room", mWrongLocality, wrongLocality, "tenant", "pending", true, null, kothrud);
        registeredAgreement(landlord, kothrud, wrongLocality.getMobile(), "registered", staff.getId());

        UUID mNoConsent = tenantRoom(noConsent);
        UUID rNoConsent = review("room", mNoConsent, noConsent, "tenant", "pending", false, null, baner);
        registeredAgreement(landlord, baner, noConsent.getMobile(), "registered", staff.getId());

        UUID mUnverified = tenantRoom(unverified);
        UUID rUnverified = review("room", mUnverified, unverified, "tenant", "pending", true, null, baner);
        registeredAgreement(landlord, baner, unverified.getMobile(), "registered", null);

        UUID mElse = tenantRoom(someoneElsesAgreement);
        UUID rElse = review("room", mElse, someoneElsesAgreement, "tenant", "pending", true, null, baner);
        registeredAgreement(landlord, baner, stranger.getMobile(), "registered", staff.getId());

        UUID mDraft = tenantRoom(draftAgreement);
        UUID rDraft = review("room", mDraft, draftAgreement, "tenant", "pending", true, null, baner);
        registeredAgreement(landlord, baner, draftAgreement.getMobile(), "e-sign-pending", staff.getId());

        UUID mEnded = tenantRoom(endedAgreement);
        UUID rEnded = review("room", mEnded, endedAgreement, "tenant", "pending", true, today.minusDays(1), baner);
        registeredAgreement(landlord, baner, endedAgreement.getMobile(), "registered", staff.getId());

        UUID mWrongSociety = tenantRoom(wrongSociety);
        set("flatmate_rooms", mWrongSociety, "society_id = ?", society1);
        UUID rWrongSociety = review("room", mWrongSociety, wrongSociety, "tenant", "pending", true, null, inSociety2);
        registeredAgreement(landlord, inSociety2, wrongSociety.getMobile(), "registered", staff.getId());

        UUID mSociety = tenantRoom(societyMatch);
        set("flatmate_rooms", mSociety, "society_id = ?", society1);
        UUID rSociety = review("room", mSociety, societyMatch, "tenant", "pending", true, null, inSociety1);
        registeredAgreement(landlord, inSociety1, societyMatch.getMobile(), "active", staff.getId());

        UUID gGroup = group(groupHost, "approved");
        set("flatmate_groups", gGroup, "verification_tier = 'tenant', property_id = ?", inSociety1);
        UUID rGroup = review("group", gGroup, groupHost, "tenant", "pending", true, null, inSociety1);
        registeredAgreement(landlord, inSociety1, groupHost.getMobile(), "registered", staff.getId());

        UUID mNoIdentity = tenantRoom(noIdentity);
        UUID rNoIdentity = review("room", mNoIdentity, noIdentity, "tenant", "pending", true, null, baner);
        registeredAgreement(landlord, baner, noIdentity.getMobile(), "registered", staff.getId());

        UUID mNoProperty = tenantRoom(noClaimedProperty);
        UUID rNoProperty = review("room", mNoProperty, noClaimedProperty, "tenant", "pending", true, null, null);
        registeredAgreement(landlord, baner, noClaimedProperty.getMobile(), "registered", staff.getId());

        UUID mIdentity = room(identityTier, "approved");
        UUID rIdentity = review("room", mIdentity, identityTier, "identity", "pending", true, null, baner);
        registeredAgreement(landlord, baner, identityTier.getMobile(), "registered", staff.getId());

        UUID mFuture = tenantRoom(validForever);
        UUID rFuture = review("room", mFuture, validForever, "tenant", "pending", true, today.plusDays(30), baner);
        registeredAgreement(landlord, baner, validForever.getMobile(), "registered", staff.getId());

        runGroup(Group.DAYTIME);

        assertThat(touched("flatmate-draazy-agreements")).isEqualTo(4);
        for (UUID approved : List.of(rOk, rSociety, rGroup, rFuture)) {
            assertThat(column("flatmate_reviews", approved, "status")).isEqualTo("approved");
            assertThat(column("flatmate_reviews", approved, "decided_by")).isNull();
            assertThat(column("flatmate_reviews", approved, "reason")).startsWith("Verified against the Leave");
        }
        assertThat(column("flatmate_reviews", rOk, "agreement_valid_till"))
                .isEqualTo(today.plusMonths(11).toString());
        assertThat(column("flatmate_reviews", rFuture, "agreement_valid_till")).isEqualTo(today.plusDays(30).toString());
        for (UUID room : List.of(mOk, mSociety, mFuture)) {
            assertThat(column("flatmate_rooms", room, "verification_tier")).isEqualTo("tenant");
            assertThat(column("flatmate_rooms", room, "flag_for_review")).isEqualTo("false");
        }
        assertThat(column("flatmate_groups", gGroup, "verification_tier")).isEqualTo("tenant");
        assertThat(notes(localityMatch)).singleElement().satisfies(n -> assertThat(n)
                .containsEntry("type", "flatmate.review.approved").containsEntry("link", "/flatmates/room/" + mOk));
        assertThat(notes(groupHost)).singleElement().satisfies(n -> assertThat(n)
                .containsEntry("type", "flatmate.review.approved").containsEntry("link", "/flatmates/group/" + gGroup));
        assertThat(noteTypes(societyMatch)).containsExactly("flatmate.review.approved");
        assertThat(noteTypes(validForever)).containsExactly("flatmate.review.approved");

        for (UUID stillPending : List.of(rWrongLocality, rNoConsent, rUnverified, rElse, rDraft, rEnded,
                rWrongSociety, rNoProperty, rIdentity, rNoIdentity)) {
            assertThat(column("flatmate_reviews", stillPending, "status")).isEqualTo("pending");
        }
        for (User quiet : List.of(wrongLocality, noConsent, unverified, someoneElsesAgreement, draftAgreement,
                endedAgreement, wrongSociety, noClaimedProperty, identityTier, noIdentity)) {
            assertThat(noteTypes(quiet)).as(quiet.getMobile()).isEmpty();
        }
        assertThat(column("flatmate_rooms", mWrongLocality, "flag_for_review")).isEqualTo("true");

        long before = noteCount();
        runGroup(Group.DAYTIME);
        assertThat(touched("flatmate-draazy-agreements")).isZero();
        assertThat(noteCount()).isEqualTo(before);
    }

    @Test
    @DisplayName("a withdrawn post is not approved nor announced to its host")
    void archivedPostsAreLeftAlone() {
        User landlord = person(80);
        User staff = person(81);
        User host = person(82);
        UUID baner = listing(landlord, "approved", "Baner");
        UUID withdrawn = tenantRoom(host);
        set("flatmate_rooms", withdrawn, "archived = true");
        UUID review = review("room", withdrawn, host, "tenant", "pending", true, null, baner);
        registeredAgreement(landlord, baner, host.getMobile(), "registered", staff.getId());

        runGroup(Group.DAYTIME);

        SoftAssertions.assertSoftly(soft -> {
            soft.assertThat(column("flatmate_reviews", review, "status")).isEqualTo("pending");
            soft.assertThat(noteTypes(host)).isEmpty();
        });
    }

    private UUID agreementEndingOn(User owner, String tenantMobile, LocalDate end, String status, UUID request) {
        for (int months = 1; months <= 36; months++) {
            LocalDate start = end.plusDays(1).minusMonths(months);
            if (start.plusMonths(months).minusDays(1).equals(end)) {
                return insertId("insert into rent_agreements (property_id, owner_id, tenant_mobile, status, rent,"
                        + " start_date, duration_months, service_request_id) values (?, ?, ?, ?, 25000, ?, ?, ?)",
                        listing(owner, "approved", "Kothrud"), owner.getId(), tenantMobile, status, start, months,
                        request);
            }
        }
        throw new IllegalStateException("no whole-month term ends on " + end);
    }

    private UUID serviceRequest(User owner) {
        return insertId("insert into service_requests (requester_id, type, team, status)"
                + " values (?, 'rent-agreement', 'rental', 'new')", owner.getId());
    }

    private boolean reminded(UUID agreement) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select renewal_reminded_at is not null from rent_agreements where id = ?", Boolean.class, agreement));
    }

    @Test
    @DisplayName("renewal reminders cover terms ending today through 60 days out, once, to owner and known tenants")
    void renewalRemindersWindowRecipientsAndIdempotence() {
        LocalDate today = LocalDate.now(PlatformTime.IST);
        User endsToday = person(1);
        User tenantToday = person(2);
        User ended = person(3);
        User day60 = person(4);
        User day61 = person(5);
        User multi = person(6);
        User multiTenantOne = person(7);
        User multiTenantTwo = person(8);
        User unusableStatuses = person(9);
        User noTerm = person(10);
        User alreadySent = person(11);
        User archivedTenantOwner = person(12);
        User archivedTenant = person(13);
        User activeOwner = person(14);
        jdbc.update("update users set archived = true where id = ?", archivedTenant.getId());

        UUID a1 = agreementEndingOn(endsToday, tenantToday.getMobile(), today, "registered", null);
        UUID a2 = agreementEndingOn(ended, "9791504099", today.minusDays(1), "registered", null);
        UUID a3 = agreementEndingOn(day60, "9791504098", today.plusDays(60), "registered", null);
        UUID a4 = agreementEndingOn(day61, "9791504097", today.plusDays(61), "registered", null);
        UUID request = serviceRequest(multi);
        UUID m1 = agreementEndingOn(multi, multiTenantOne.getMobile(), today.plusDays(20), "registered", request);
        UUID m2 = agreementEndingOn(multi, multiTenantTwo.getMobile(), today.plusDays(10), "active", request);
        UUID m3 = agreementEndingOn(multi, "9791504096", today.plusDays(12), "registered", request);
        UUID m4 = agreementEndingOn(multi, multi.getMobile(), today.plusDays(15), "registered", request);
        UUID d1 = agreementEndingOn(unusableStatuses, "9791504095", today.plusDays(5), "draft", null);
        UUID d2 = agreementEndingOn(unusableStatuses, "9791504094", today.plusDays(5), "e-sign-pending", null);
        UUID d3 = agreementEndingOn(unusableStatuses, "9791504093", today.plusDays(5), "expired", null);
        UUID n1 = agreementEndingOn(noTerm, "9791504092", today.plusDays(5), "registered", null);
        jdbc.update("update rent_agreements set start_date = null where id = ?", n1);
        UUID s1 = agreementEndingOn(alreadySent, "9791504091", today.plusDays(5), "registered", null);
        jdbc.update("update rent_agreements set renewal_reminded_at = now() - interval '2 days' where id = ?", s1);
        UUID t1 = agreementEndingOn(archivedTenantOwner, archivedTenant.getMobile(), today.plusDays(30), "registered",
                null);
        UUID o1 = agreementEndingOn(activeOwner, null, today.plusDays(30), "active", null);

        runGroup(Group.DAYTIME);

        assertThat(touched("renewal-reminders")).isEqualTo(5);
        for (UUID sent : List.of(a1, a3, m1, m2, m3, m4, t1, o1)) {
            assertThat(reminded(sent)).as("reminded %s", sent).isTrue();
        }
        for (UUID skipped : List.of(a2, a4, d1, d2, d3, n1)) {
            assertThat(reminded(skipped)).as("skipped %s", skipped).isFalse();
        }
        assertThat(noteTypes(endsToday)).containsExactly("agreement.renewal");
        assertThat(notes(tenantToday)).singleElement().satisfies(n -> assertThat(n)
                .containsEntry("type", "agreement.renewal").containsEntry("link", "/dashboard#rental")
                .containsEntry("title", "Your rent agreement ends on " + DAY.format(today)));
        assertThat(notes(endsToday).get(0)).containsEntry("link", "/dashboard#documents");
        assertThat(noteTypes(day60)).containsExactly("agreement.renewal");
        for (User quiet : List.of(ended, day61, unusableStatuses, noTerm, alreadySent, archivedTenant)) {
            assertThat(noteTypes(quiet)).as(quiet.getMobile()).isEmpty();
        }
        assertThat(notes(multi)).singleElement().satisfies(n -> assertThat(n)
                .containsEntry("title", "Your rent agreement ends on " + DAY.format(today.plusDays(10)))
                .containsEntry("link", "/dashboard#documents"));
        assertThat(noteTypes(multiTenantOne)).containsExactly("agreement.renewal");
        assertThat(noteTypes(multiTenantTwo)).containsExactly("agreement.renewal");
        assertThat(noteTypes(archivedTenantOwner)).containsExactly("agreement.renewal");
        assertThat(noteTypes(activeOwner)).containsExactly("agreement.renewal");

        long before = noteCount();
        runGroup(Group.DAYTIME);
        assertThat(touched("renewal-reminders")).isZero();
        assertThat(noteCount()).isEqualTo(before);
    }

    private final List<String[]> sent = new ArrayList<>();
    private final Set<String> vendorRejects = new HashSet<>();
    private final Set<String> vendorThrows = new HashSet<>();

    private Object digestTarget() {
        Object target = AopProxyUtils.getSingletonTarget(digest);
        return target == null ? digest : target;
    }

    private void useRecordingMessenger() {
        realMessenger = ReflectionTestUtils.getField(digestTarget(), "messenger");
        sent.clear();
        vendorRejects.clear();
        vendorThrows.clear();
        DecisionMessenger fake = new DecisionMessenger() {
            @Override
            public void sendIdentityDecision(String mobile, String line) {
            }

            @Override
            public boolean sendWaitingDigest(String mobile, String waiting) {
                sent.add(new String[] {mobile, waiting});
                if (vendorThrows.contains(mobile)) {
                    throw new IllegalStateException("vendor down");
                }
                return !vendorRejects.contains(mobile);
            }

            @Override
            public boolean sendOwnerNotice(String mobile, String tenantName, String place, String link) {
                return false;
            }
        };
        ReflectionTestUtils.setField(digestTarget(), "messenger", fake);
    }

    private void contactRequest(UUID property, User requester, String status, Duration age) {
        jdbc.update("insert into contact_requests (property_id, requester_id, status, created_at)"
                + " values (?, ?, ?, ?)", property, requester.getId(), status, ts(fromNow(age.negated())));
    }

    private void lastActive(User u, Duration age) {
        jdbc.update("update users set last_active = ? where id = ?", ts(fromNow(age.negated())), u.getId());
    }

    private Instant digestAt(User u) {
        Timestamp at = jdbc.queryForObject("select waiting_digest_at from users where id = ?", Timestamp.class,
                u.getId());
        return at == null ? null : at.toInstant();
    }

    private List<String> sentTo(User u) {
        return sent.stream().filter(s -> s[0].equals(u.getMobile())).map(s -> s[1]).toList();
    }

    @Test
    @DisplayName("the digest batches every kind of waiting request into one message per owner and respects each gate")
    void waitingDigestBatchesAndGates() {
        useRecordingMessenger();
        User buyer = person(90);
        User busy = person(91);
        User third = person(92);
        User mixed = person(1);
        User opened = person(2);
        User previous = person(3);
        User tooSoon = person(4);
        User muted = person(5);
        User suspended = person(6);
        User archivedOwner = person(7);
        User deadListing = person(8);
        User vendorFails = person(9);
        User vendorThrowsUser = person(12);

        UUID mixedListing = listing(mixed, "approved", "Baner");
        contactRequest(mixedListing, buyer, "pending", Duration.ofHours(5));
        contactRequest(mixedListing, busy, "pending", Duration.ofHours(3));
        contactRequest(mixedListing, third, "approved", Duration.ofHours(3));
        jdbc.update("insert into offers (property_id, from_user_id, amount, created_at) values (?, ?, 900000, ?)",
                mixedListing, buyer.getId(), ts(fromNow(Duration.ofHours(-4))));
        jdbc.update("insert into document_requests (property_id, requester_id, created_at) values (?, ?, ?)",
                mixedListing, buyer.getId(), ts(fromNow(Duration.ofHours(-4))));
        jdbc.update("insert into visits (property_id, visitor_id, slot, created_at) values (?, ?, ?, ?)",
                mixedListing, buyer.getId(), ts(fromNow(Duration.ofDays(1))), ts(fromNow(Duration.ofHours(-2))));
        jdbc.update("insert into visits (property_id, visitor_id, slot, created_at, status) values (?, ?, ?, ?,"
                + " 'confirmed')", mixedListing, busy.getId(), ts(fromNow(Duration.ofDays(1))),
                ts(fromNow(Duration.ofHours(-2))));
        jdbc.update("insert into visits (property_id, visitor_id, slot, created_at) values (?, ?, ?, ?)",
                mixedListing, third.getId(), ts(fromNow(Duration.ofHours(-1))), ts(fromNow(Duration.ofHours(-6))));

        contactRequest(listing(opened, "approved", "Baner"), buyer, "pending", Duration.ofHours(3));
        lastActive(opened, Duration.ofHours(1));

        UUID previousListing = listing(previous, "approved", "Baner");
        contactRequest(previousListing, buyer, "pending", Duration.ofHours(30));
        contactRequest(previousListing, busy, "pending", Duration.ofHours(2));
        jdbc.update("update users set waiting_digest_at = ? where id = ?", ts(fromNow(Duration.ofHours(-25))),
                previous.getId());

        UUID tooSoonListing = listing(tooSoon, "approved", "Baner");
        contactRequest(tooSoonListing, buyer, "pending", Duration.ofHours(2));
        Instant recentDigest = fromNow(Duration.ofHours(-5));
        jdbc.update("update users set waiting_digest_at = ? where id = ?", ts(recentDigest), tooSoon.getId());
        contactRequest(tooSoonListing, busy, "pending", Duration.ofHours(1));

        contactRequest(listing(muted, "approved", "Baner"), buyer, "pending", Duration.ofHours(3));
        jdbc.update("insert into notification_preferences (user_id, whatsapp) values (?, false)", muted.getId());

        contactRequest(listing(suspended, "approved", "Baner"), buyer, "pending", Duration.ofHours(3));
        jdbc.update("update users set status = 'suspended' where id = ?", suspended.getId());

        contactRequest(listing(archivedOwner, "approved", "Baner"), buyer, "pending", Duration.ofHours(3));
        jdbc.update("update users set archived = true where id = ?", archivedOwner.getId());

        contactRequest(listing(deadListing, "paused", "Baner"), buyer, "pending", Duration.ofHours(3));
        contactRequest(listing(deadListing, "pending", "Baner"), buyer, "pending", Duration.ofHours(3));
        UUID takenDown = listing(deadListing, "approved", "Baner");
        jdbc.update("update properties set archived = true where id = ?", takenDown);
        contactRequest(takenDown, buyer, "pending", Duration.ofHours(3));

        contactRequest(listing(vendorFails, "approved", "Baner"), buyer, "pending", Duration.ofHours(3));
        vendorRejects.add(vendorFails.getMobile());
        contactRequest(listing(vendorThrowsUser, "approved", "Baner"), buyer, "pending", Duration.ofHours(3));
        vendorThrows.add(vendorThrowsUser.getMobile());

        Instant beforeRun = Instant.now();
        runGroup(Group.DAYTIME);

        assertThat(touched("waiting-digest")).isEqualTo(2);
        assertThat(sentTo(mixed)).containsExactly("5 requests");
        assertThat(sentTo(previous)).containsExactly("1 request");
        assertThat(sentTo(vendorFails)).containsExactly("1 request");
        assertThat(sentTo(vendorThrowsUser)).containsExactly("1 request");
        for (User silent : List.of(opened, tooSoon, muted, suspended, archivedOwner, deadListing, buyer, busy)) {
            assertThat(sentTo(silent)).as(silent.getMobile()).isEmpty();
        }
        assertThat(sent).hasSize(4);

        assertThat(digestAt(mixed)).isAfterOrEqualTo(beforeRun.minusSeconds(1));
        assertThat(digestAt(previous)).isAfterOrEqualTo(beforeRun.minusSeconds(1));
        assertThat(digestAt(vendorFails)).isNull();
        assertThat(digestAt(vendorThrowsUser)).isNull();
        assertThat(digestAt(opened)).isNull();
        assertThat(digestAt(muted)).isNull();
        assertThat(Duration.between(digestAt(tooSoon), recentDigest).abs()).isLessThan(Duration.ofMillis(1));

        runGroup(Group.DAYTIME);
        assertThat(sentTo(mixed)).hasSize(1);
        assertThat(sentTo(previous)).hasSize(1);
        assertThat(sentTo(vendorFails)).hasSize(2);
        assertThat(sentTo(vendorThrowsUser)).hasSize(2);
        assertThat(touched("waiting-digest")).isEqualTo(0);
    }

    @Test
    @DisplayName("the next day's digest counts only requests that arrived after the previous digest")
    void nextDigestAnnouncesOnlyNewItems() {
        useRecordingMessenger();
        User third = person(92);
        User second = person(91);
        User buyer = person(90);
        User owner = person(10);
        UUID listing = listing(owner, "approved", "Baner");
        contactRequest(listing, buyer, "pending", Duration.ofHours(4));
        contactRequest(listing, second, "pending", Duration.ofHours(3));

        runGroup(Group.DAYTIME);
        assertThat(sentTo(owner)).containsExactly("2 requests");
        assertThat(touched("waiting-digest")).isEqualTo(1);

        jdbc.update("update users set waiting_digest_at = waiting_digest_at - interval '1 day' where id = ?",
                owner.getId());
        jdbc.update("update contact_requests set created_at = created_at - interval '2 days'"
                + " where property_id = ?", listing);
        runGroup(Group.DAYTIME);
        assertThat(sentTo(owner)).hasSize(1);
        assertThat(touched("waiting-digest")).isZero();

        contactRequest(listing, third, "pending", Duration.ofMinutes(30));
        runGroup(Group.DAYTIME);
        assertThat(sentTo(owner)).containsExactly("2 requests", "1 request");
        assertThat(touched("waiting-digest")).isEqualTo(1);
    }

    @Test
    @DisplayName("with the keyless WhatsApp provider nothing is counted sent and the claim is released for the next day")
    void unsentDigestDoesNotSwallowTheRequests() {
        User buyer = person(90);
        User owner = person(11);
        contactRequest(listing(owner, "approved", "Baner"), buyer, "pending", Duration.ofHours(3));

        runGroup(Group.DAYTIME);

        assertThat(touched("waiting-digest")).isZero();
        assertThat(digestAt(owner)).isNull();
        assertThat(awaitLedger(owner, 1)).isEqualTo(1);

        runGroup(Group.DAYTIME);
        assertThat(awaitLedger(owner, 2)).isEqualTo(2);
        assertThat(digestAt(owner)).isNull();
    }

    private long awaitLedger(User owner, long expected) {
        String hash = ProviderCalls.hashRecipient(owner.getMobile());
        long count = 0;
        for (int i = 0; i < 60; i++) {
            count = jdbc.queryForObject("select count(*) from provider_call where operation = ? and recipient_hash = ?",
                    Long.class, DecisionMessenger.WAITING_DIGEST, hash);
            if (count >= expected) {
                return count;
            }
            try {
                Thread.sleep(50);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        return count;
    }
}
