package com.draazy.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.jayway.jsonpath.JsonPath;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

/** Flatmate figures on {@code /admin/dashboard}, {@code /admin/analytics/flatmates} and the SLA report. Posts left by
 * other suites make post counts deltas; requests and applications are cleared inside the rolled-back transaction. */
@DisplayName("Flatmate analytics — dashboard tiles, weekly report and moderation SLA")
class AdminFlatmateAnalyticsTest extends AbstractApiTest {

    @Autowired UserRepository users;

    private User admin;
    private User host;
    private int mobiles;

    @BeforeEach
    void seed() {
        admin = user(Roles.Wire.ADMIN);
        host = user(Roles.Wire.OWNER);
        jdbc.update("delete from flatmate_group_applications");
        jdbc.update("delete from flatmate_requests");
    }

    private User user(String role) {
        User u = new User("98777" + String.format("%05d", 70000 + mobiles++), role);
        u.setName("Flatmate stats " + mobiles);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String read(String route, User caller) throws Exception {
        return mvc.perform(get(route).header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private UUID room(String modStatus, String locality, int hoursAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into flatmate_rooms (id, host_id, room_type, budget, locality, mod_status, created_at)
                values (?, ?, 'Private room', 15000, ?, ?, now() - make_interval(hours => ?))
                """, id, host.getId(), locality, modStatus, hoursAgo);
        return id;
    }

    private UUID group(String modStatus, String locality, int hoursAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into flatmate_groups (id, host_id, title, locality, rent, mod_status, created_at)
                values (?, ?, 'Stats group', ?, 30000, ?, now() - make_interval(hours => ?))
                """, id, host.getId(), locality, modStatus, hoursAgo);
        return id;
    }

    private UUID seeker(String modStatus, String localitiesJson, int hoursAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into flatmate_seeker_posts (id, user_id, name, budget, localities, mod_status, created_at)
                values (?, ?, 'Stats seeker', 12000, ?::jsonb, ?, now() - make_interval(hours => ?))
                """, id, user(Roles.Wire.BUYER).getId(), localitiesJson, modStatus, hoursAgo);
        return id;
    }

    /** {@code repliedAfterHours} null leaves the request pending. */
    private void request(UUID target, String action, String status, int sentHoursAgo, Integer repliedAfterHours) {
        jdbc.update("""
                insert into flatmate_requests (kind, target_id, host_id, requester_id, action, status,
                                               requested_at, decided_at)
                values ('room', ?, ?, ?, ?, ?, now() - make_interval(hours => ?),
                        case when ?::int is null then null
                             else now() - make_interval(hours => ?) + make_interval(hours => ?::int) end)
                """, target, host.getId(), user(Roles.Wire.BUYER).getId(), action, status, sentHoursAgo,
                repliedAfterHours, sentHoursAgo, repliedAfterHours);
    }

    private static long num(String json, String path) {
        return ((Number) JsonPath.read(json, path)).longValue();
    }

    private static long total(String json, String field) {
        List<Number> values = JsonPath.read(json, "$.weeks[*]." + field);
        return values.stream().mapToLong(Number::longValue).sum();
    }

    @Test
    void theWeeklyReportCountsPostsRequestsAndMatchesAndJudgesRepliesAt48Hours() throws Exception {
        String before = read(Routes.Admin.ANALYTICS_FLATMATES + "?days=90", admin);
        UUID live = room("approved", "Baner", 240);
        room("rejected", "Baner", 240);
        group("live", "Kharadi", 240);
        seeker("pending", "[\"Baner\"]", 240);

        request(live, "request", "accepted", 240, 5);
        request(live, "request", "declined", 240, 60);
        request(live, "request", "pending", 240, null);
        request(live, "request", "pending", 1, null);
        request(live, "join", "accepted", 200, 0);

        String after = read(Routes.Admin.ANALYTICS_FLATMATES + "?days=90", admin);
        assertThat(total(after, "rooms") - total(before, "rooms")).as("withdrawn or rejected posts still posted").isEqualTo(2);
        assertThat(total(after, "groups") - total(before, "groups")).isEqualTo(1);
        assertThat(total(after, "seekers") - total(before, "seekers")).isEqualTo(1);
        assertThat(total(after, "requests")).as("a join is not a request").isEqualTo(4);
        assertThat(total(after, "matches")).isEqualTo(2);

        assertThat(num(after, "$.replies.sent")).isEqualTo(4);
        // Judged: the two answered and the one pending past 48h; the fresh one has not had its chance.
        assertThat(num(after, "$.replies.replyRatePct")).isEqualTo(33);
        assertThat(num(after, "$.replies.acceptRatePct")).isEqualTo(50);
        assertThat(((Number) JsonPath.read(after, "$.replies.medianReplyHours")).doubleValue()).isEqualTo(32.5);
        assertThat(num(after, "$.replies.unansweredNow")).isEqualTo(1);
    }

    @Test
    void withNoRequestsTheRatesAreNullNotZero() throws Exception {
        String json = read(Routes.Admin.ANALYTICS_FLATMATES + "?days=30", admin);
        assertThat((Object) JsonPath.read(json, "$.replies.replyRatePct")).isNull();
        assertThat((Object) JsonPath.read(json, "$.replies.acceptRatePct")).isNull();
        assertThat((Object) JsonPath.read(json, "$.replies.medianReplyHours")).isNull();
        List<Object> weekly = JsonPath.read(json, "$.weeks[*].replyRatePct");
        assertThat(weekly).isNotEmpty().containsOnlyNulls();
    }

    @Test
    void localitiesSetLiveSupplyAgainstLiveDemand() throws Exception {
        String town = "Stats Gap Town";
        String before = read(Routes.Admin.ANALYTICS_FLATMATES, admin);
        room("approved", town, 5);
        room("pending", town, 5);
        seeker("live", "[\"" + town + "\", \"Stats Other Town\"]", 5);
        seeker("live", "[\"stats gap town \"]", 5);
        seeker("removed", "[\"" + town + "\"]", 5);
        // Enough demand to rank inside the capped list whatever else the shared database holds.
        for (int i = 0; i < 25; i++) {
            seeker("live", "[\"" + town + "\"]", 5);
        }
        jdbc.update("""
                insert into flatmate_groups (host_id, title, locality, localities, rent, hunting, mod_status)
                values (?, 'Hunting', 'Elsewhere', ?::jsonb, 40000, true, 'live')
                """, host.getId(), "[\"" + town + "\"]");

        String after = read(Routes.Admin.ANALYTICS_FLATMATES, admin);
        assertThat((Integer) JsonPath.read(before, "$.days")).isEqualTo(AdminFlatmateAnalyticsService.DEFAULT_DAYS);
        List<Number> supply = JsonPath.read(after, "$.localities[?(@.locality == '" + town + "')].supply");
        List<Number> demand = JsonPath.read(after, "$.localities[?(@.locality == '" + town + "')].demand");
        assertThat(supply).singleElement().extracting(Number::longValue).isEqualTo(1L);
        assertThat(demand).as("seekers match case-insensitively; a hunting group is demand").singleElement()
                .extracting(Number::longValue).isEqualTo(28L);
    }

    @Test
    void theWindowIsValidatedAndTheReportIsBackOfficeOnly() throws Exception {
        for (int days : new int[] {0, 366}) {
            mvc.perform(get(Routes.Admin.ANALYTICS_FLATMATES + "?days=" + days)
                            .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                    .andExpect(status().isBadRequest());
        }
        mvc.perform(get(Routes.Admin.ANALYTICS_FLATMATES)
                        .header(HttpHeaders.AUTHORIZATION, bearer(user(Roles.Wire.BUYER))))
                .andExpect(status().isForbidden());
    }

    @Test
    void theDashboardCarriesTheFlatmateTiles() throws Exception {
        String before = read(Routes.Admin.DASHBOARD, admin);
        UUID live = room("approved", "Baner", 5);
        seeker("live", "[\"Baner\"]", 2);
        jdbc.update("""
                insert into reports (reporter_id, target_type, target_id, reason, status)
                values (?, 'post', ?, 'spam', 'open')
                """, host.getId(), live.toString());
        request(live, "request", "accepted", 72, 2);
        request(live, "request", "pending", 72, null);

        String after = read(Routes.Admin.DASHBOARD, admin);
        assertThat(num(after, "$.flatmates.liveRooms") - num(before, "$.flatmates.liveRooms")).isEqualTo(1);
        assertThat(num(after, "$.flatmates.activeSeekers") - num(before, "$.flatmates.activeSeekers")).isEqualTo(1);
        assertThat(num(after, "$.flatmates.newSeekers7d") - num(before, "$.flatmates.newSeekers7d")).isEqualTo(1);
        assertThat(num(after, "$.flatmates.openReports") - num(before, "$.flatmates.openReports")).isEqualTo(1);
        assertThat(num(after, "$.flatmates.unansweredRequests")).isEqualTo(1);
        assertThat(num(after, "$.flatmates.matches30d")).isEqualTo(1);
        assertThat(num(after, "$.flatmates.replyRatePct")).isEqualTo(50);
        assertThat(num(after, "$.flatmates.awaitingReview")).isGreaterThanOrEqualTo(0);
        assertThat(num(after, "$.sla.flatmateReview.targetHours")).isEqualTo(24);
    }

    @Test
    void theDashboardLeavesFlatmatesOutForStaffWithoutTheDesk() throws Exception {
        User analyst = user(Roles.Wire.STAFF);
        jdbc.update("insert into back_office_permissions (user_id, permissions) values (?, '[\"analytics\"]'::jsonb)",
                analyst.getId());
        String json = read(Routes.Admin.DASHBOARD, analyst);
        assertThat(JsonPath.parse(json).read("$", java.util.Map.class)).doesNotContainKey("flatmates");
    }

    @Test
    void theModerationSlaTimesTheFirstDecisionOutOfPending() throws Exception {
        String before = read(Routes.Admin.ANALYTICS_SLA, admin);
        UUID decided = seeker("approved", "[\"Baner\"]", 40);
        moderate("flatmateSeekerPost", decided, "pending", 30);
        // A takedown of a live post later on is not review turnaround.
        moderate("flatmateSeekerPost", decided, "approved", 5);
        room("pending", "Baner", 30);
        UUID rechecked = group("live", "Baner", 100);
        jdbc.update("update flatmate_groups set recheck_requested_at = now() - interval '2 hours' where id = ?", rechecked);
        UUID reheld = room("pending", "Baner", 500);
        moderate("flatmateRoom", reheld, "pending", 400);

        String after = read(Routes.Admin.ANALYTICS_SLA, admin);
        assertThat(num(after, "$.flatmateReview.completedCount") - num(before, "$.flatmateReview.completedCount"))
                .isEqualTo(2);
        assertThat(num(after, "$.flatmateReview.outstandingCount") - num(before, "$.flatmateReview.outstandingCount"))
                .isEqualTo(3);
        assertThat(num(after, "$.flatmateReview.outstandingBreachingCount")
                - num(before, "$.flatmateReview.outstandingBreachingCount"))
                .as("only the post pending for 30h is late; a re-check and a re-hold wait from their last write")
                .isEqualTo(1);
    }

    private void moderate(String entity, UUID id, String from, int hoursAgo) {
        jdbc.update("""
                insert into audit_log (actor, actor_role, action, entity, entity_id, metadata, at)
                values ('stats-fixture', 'admin', 'flatmate.moderate', ?, ?, jsonb_build_object('from', ?),
                        now() - make_interval(hours => ?))
                """, entity, id.toString(), from, hoursAgo);
    }
}
