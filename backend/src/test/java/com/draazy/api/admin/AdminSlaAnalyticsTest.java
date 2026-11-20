package com.draazy.api.admin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("/admin/analytics/sla — moderation turnaround, measured not modelled")
class AdminSlaAnalyticsTest extends AbstractApiTest {
    private static final int TARGET_HOURS = 24;

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;

    private String bearerFor(String mobile, String role, String name) {
        User u = new User(mobile, role);
        u.setName(name);
        u.setMobileVerified(true);
        if (Roles.Wire.STAFF.equals(role)) u.setTeam(Teams.RENTAL);
        return bearer(users.saveAndFlush(u));
    }

    private String admin() {
        return bearerFor("9877750001", Roles.Wire.ADMIN, "SLA admin");
    }

    private String consumer() {
        return bearerFor("9877750002", Roles.Wire.BUYER, "SLA buyer");
    }

    private String body(String url, String token) throws Exception {
        return mvc.perform(get(url).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private static long num(String json, String path) {
        return ((Number) JsonPath.read(json, path)).longValue();
    }

    private void clearRecordedDecisions() {
        jdbc.update("delete from audit_log where action in ('property.status', 'property.verification.decision')"
                + " and entity = 'property'");
    }

    private UUID listing(String suffix, String status, int ageHours) {
        User owner = new User("987775" + suffix, Roles.Wire.OWNER);
        owner.setName("SLA Landlord " + suffix);
        owner.setMobileVerified(true);
        owner = users.saveAndFlush(owner);

        Property p = new Property(owner, "SLA flat " + suffix, "rent", "apartment",
                25_000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setArea(new BigDecimal("900"));
        p.setPriceUnit("per-month");
        p.setStatus(status);
        properties.saveAndFlush(p);

        jdbc.update("update properties set created_at = now() - make_interval(hours => cast(? as int)) "
                + "where id = ?", ageHours, p.getId());
        return p.getId();
    }

    private void recordDecision(UUID propertyId, int hoursAfterCreation) {
        jdbc.update("""
                insert into audit_log (actor, actor_role, action, entity, entity_id, metadata, at)
                values ('sla-fixture', 'admin', 'property.status', 'property', ?, '{}'::jsonb,
                        (select created_at from properties where id = ?)
                        + make_interval(hours => cast(? as int)))
                """, propertyId.toString(), propertyId, hoursAfterCreation);
    }

    private void recordDecisionBySlug(UUID propertyId, int hoursAfterCreation) {
        jdbc.update("""
                insert into audit_log (actor, actor_role, action, entity, entity_id, metadata, at)
                values ('sla-fixture', 'admin', 'property.status', 'property',
                        (select slug from properties where id = ?), '{}'::jsonb,
                        (select created_at from properties where id = ?)
                        + make_interval(hours => cast(? as int)))
                """, propertyId, propertyId, hoursAfterCreation);
    }

    private void recordStatusDecision(UUID propertyId, int hoursAfterCreation, String toStatus) {
        jdbc.update("""
                insert into audit_log (actor, actor_role, action, entity, entity_id, metadata, at)
                values ('sla-fixture', 'admin', 'property.status', 'property', ?,
                        jsonb_build_object('to', cast(? as text)),
                        (select created_at from properties where id = ?)
                        + make_interval(hours => cast(? as int)))
                """, propertyId.toString(), toStatus, propertyId, hoursAfterCreation);
    }

    private void recordChecklistDecision(UUID propertyId, int hoursAfterCreation, String toStatus) {
        jdbc.update("""
                insert into audit_log (actor, actor_role, action, entity, entity_id, metadata, at)
                values ('sla-fixture', 'admin', 'property.verification.decision', 'property', ?,
                        jsonb_build_object('decision', 'approve', 'to', cast(? as text)),
                        (select created_at from properties where id = ?)
                        + make_interval(hours => cast(? as int)))
                """, propertyId.toString(), toStatus, propertyId, hoursAfterCreation);
    }

    private UUID ticket(String subject, String status, int ageHours) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into tickets (id, subject, team, priority, status, created_at, updated_at)
                values (?, ?, 'rental', 'medium', ?,
                        now() - make_interval(hours => cast(? as int)), now())
                """, id, subject, status, ageHours);
        return id;
    }

    private void assignTicket(UUID ticketId, UUID assigneeId) {
        jdbc.update("update tickets set assignee_id = ? where id = ?", assigneeId, ticketId);
    }

    private void recordTicketUpdate(UUID ticketId, int hoursAfterCreation,
            String toStatus, String assigneeId) {
        jdbc.update("""
                insert into audit_log (actor, actor_role, action, entity, entity_id, metadata, at)
                values ('sla-fixture', 'admin', 'ticket.update', 'ticket', ?,
                        jsonb_build_object('toStatus', cast(? as text),
                                           'assigneeId', cast(? as text)),
                        (select created_at from tickets where id = ?)
                        + make_interval(hours => cast(? as int)))
                """, ticketId.toString(), toStatus, assigneeId, ticketId, hoursAfterCreation);
    }

    private void clearRecordedTicketUpdates() {
        jdbc.update("delete from audit_log where action = 'ticket.update' and entity = 'ticket'");
        jdbc.update("delete from tickets");
    }

    @Nested
    @DisplayName("the guard")
    class Guard {
        @Test
        void aPlainConsumerCannotReadIt() throws Exception {
            mvc.perform(get(Routes.Admin.ANALYTICS_SLA).header(HttpHeaders.AUTHORIZATION, consumer()))
                    .andExpect(status().isForbidden());
        }

        @Test
        void anAdministratorReachesIt() throws Exception {
            mvc.perform(get(Routes.Admin.ANALYTICS_SLA).header(HttpHeaders.AUTHORIZATION, admin()))
                    .andExpect(status().isOk());
        }

        @Test
        void opsStaffReachesIt() throws Exception {
            String staff = bearerFor("9877750003", Roles.Wire.STAFF, "SLA staff");
            mvc.perform(get(Routes.Admin.ANALYTICS_SLA).header(HttpHeaders.AUTHORIZATION, staff))
                    .andExpect(status().isOk());
        }
    }

    @Nested
    @DisplayName("the shape")
    class Shape {
        @Test
        void theResponseCarriesTheTargetAndEveryCount() throws Exception {
            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat((int) num(json, "$.targetHours")).isEqualTo(TARGET_HOURS);
            assertThat(num(json, "$.reviewedCount")).isNotNegative();
            assertThat(num(json, "$.breachedCount")).isNotNegative();
            assertThat(num(json, "$.pendingCount")).isNotNegative();
            assertThat(num(json, "$.pendingBreachingCount")).isNotNegative();
            assertThat((List<?>) JsonPath.read(json, "$.worstPending"))
                    .as("the offender list is always present, even when empty")
                    .isNotNull();
        }

        @Test
        void anImpossibleWindowIsRejected() throws Exception {
            String admin = admin();

            mvc.perform(get(Routes.Admin.ANALYTICS_SLA + "?days=0")
                            .header(HttpHeaders.AUTHORIZATION, admin))
                    .andExpect(status().isBadRequest());
            mvc.perform(get(Routes.Admin.ANALYTICS_SLA + "?days=4000")
                            .header(HttpHeaders.AUTHORIZATION, admin))
                    .andExpect(status().isBadRequest());
        }
    }

    @Nested
    @DisplayName("turnaround")
    class Turnaround {
        @Test
        void turnaroundIsTheFirstDecision_notTheLatestAndNotTheirAverage() throws Exception {
            clearRecordedDecisions();
            UUID id = listing("0010", PropertyStatus.APPROVED, 400);
            recordDecision(id, 5);
            recordDecision(id, 200);

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.reviewedCount"))
                    .as("two audit rows describe one reviewed listing, not two")
                    .isEqualTo(1);
            assertThat(((Number) JsonPath.read(json, "$.avgHoursToReview")).doubleValue())
                    .as("5 = earliest (correct); 200 = latest; 102.5 = mean of both")
                    .isEqualTo(5.0);
            assertThat(((Number) JsonPath.read(json, "$.medianHoursToReview")).doubleValue())
                    .isEqualTo(5.0);
        }

        @Test
        void aDecisionRecordedAgainstTheSlugStillCounts() throws Exception {
            clearRecordedDecisions();
            UUID id = listing("0031", PropertyStatus.APPROVED, 400);
            jdbc.update("update properties set slug = ? where id = ?", "sla-slug-fixture", id);
            recordDecisionBySlug(id, 6);

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.reviewedCount"))
                    .as("the slug identifies the same listing the id would have")
                    .isEqualTo(1);
            assertThat(((Number) JsonPath.read(json, "$.avgHoursToReview")).doubleValue())
                    .isEqualTo(6.0);
        }

        @Test
        void aVerificationChecklistDecisionCountsAsAReview() throws Exception {
            clearRecordedDecisions();
            recordChecklistDecision(listing("0032", PropertyStatus.APPROVED, 400), 7, "approved");

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.reviewedCount")).isEqualTo(1);
            assertThat(((Number) JsonPath.read(json, "$.avgHoursToReview")).doubleValue()).isEqualTo(7.0);
        }

        @Test
        void aTurnaroundPastTheTargetIsABreachAndMovesTheRate() throws Exception {
            clearRecordedDecisions();
            recordDecision(listing("0011", PropertyStatus.APPROVED, 400), 4);
            recordDecision(listing("0012", PropertyStatus.APPROVED, 400), 8);
            recordDecision(listing("0013", PropertyStatus.REJECTED, 400), 48);

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.reviewedCount"))
                    .as("a rejection is a decision — it is the queue being worked, not skipped")
                    .isEqualTo(3);
            assertThat(num(json, "$.breachedCount")).isEqualTo(1);
            assertThat(num(json, "$.slaRatePct")).as("two of three inside 24h").isEqualTo(67);
            assertThat(((Number) JsonPath.read(json, "$.avgHoursToReview")).doubleValue())
                    .as("(4 + 8 + 48) / 3")
                    .isEqualTo(20.0);
            assertThat(((Number) JsonPath.read(json, "$.medianHoursToReview")).doubleValue())
                    .as("the median is 8 — the figure the mean of 20 was hiding")
                    .isEqualTo(8.0);
        }

        @Test
        void aPendingListingIsNotCountedAsReviewed() throws Exception {
            clearRecordedDecisions();
            listing("0014", PropertyStatus.PENDING, 400);

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());
            assertThat(num(json, "$.reviewedCount")).isZero();
        }

        @Test
        void aListingThatMovedOnAfterItsDecisionStillCountsAsReviewed() throws Exception {
            clearRecordedDecisions();
            recordDecision(listing("0050", PropertyStatus.SOLD, 400), 6);
            recordDecision(listing("0051", PropertyStatus.PENDING, 400), 6);

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());
            assertThat(num(json, "$.reviewedCount")).isEqualTo(2);
        }

        @Test
        void theWindowFiltersOnTheDecisionInstant() throws Exception {
            clearRecordedDecisions();
            recordDecision(listing("0015", PropertyStatus.APPROVED, 2400), 6);
            recordDecision(listing("0016", PropertyStatus.APPROVED, 2400), 2376);

            String token = admin();
            assertThat(num(body(Routes.Admin.ANALYTICS_SLA, token), "$.reviewedCount"))
                    .as("all time sees both")
                    .isEqualTo(2);
            assertThat(num(body(Routes.Admin.ANALYTICS_SLA + "?days=30", token), "$.reviewedCount"))
                    .as("only the listing decided inside the window, however old the listing is")
                    .isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("an empty record")
    class EmptyRecord {
        @Test
        void withNothingReviewedTheAverageAndTheRateAreNull_notZeroAndNotAHundred()
                throws Exception {
            clearRecordedDecisions();

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.reviewedCount")).isZero();
            assertThat((Object) JsonPath.read(json, "$.avgHoursToReview"))
                    .as("0 would claim every review was instant")
                    .isNull();
            assertThat((Object) JsonPath.read(json, "$.medianHoursToReview")).isNull();
            assertThat((Object) JsonPath.read(json, "$.slaRatePct"))
                    .as("100 would claim a perfect record; 0 would claim a total failure")
                    .isNull();
            assertThat(num(json, "$.breachedCount"))
                    .as("no reviews ran late, which is true and is not a fabrication")
                    .isZero();
        }
    }

    @Nested
    @DisplayName("the backlog")
    class Backlog {
        @Test
        void aPendingListingOlderThanTheTargetIsBreachingNow() throws Exception {
            String token = admin();
            String before = body(Routes.Admin.ANALYTICS_SLA, token);
            long pendingBefore = num(before, "$.pendingCount");
            long breachingBefore = num(before, "$.pendingBreachingCount");

            listing("0020", PropertyStatus.PENDING, 48);
            listing("0021", PropertyStatus.PENDING, 1);

            String after = body(Routes.Admin.ANALYTICS_SLA, token);
            assertThat(num(after, "$.pendingCount") - pendingBefore)
                    .as("both are waiting")
                    .isEqualTo(2);
            assertThat(num(after, "$.pendingBreachingCount") - breachingBefore)
                    .as("only the 48-hour-old one is past a 24-hour target")
                    .isEqualTo(1);
        }

        @Test
        void theWindowDoesNotHideOldBacklog() throws Exception {
            String token = admin();
            long before = num(body(Routes.Admin.ANALYTICS_SLA + "?days=1", token),
                    "$.pendingBreachingCount");

            listing("0022", PropertyStatus.PENDING, 2400);

            assertThat(num(body(Routes.Admin.ANALYTICS_SLA + "?days=1", token),
                    "$.pendingBreachingCount") - before)
                    .as("a listing posted 100 days ago is exactly what a backlog report is for")
                    .isEqualTo(1);
        }

        @Test
        void aResubmittedListingWaitsFromItsResubmission_notItsCreation() throws Exception {
            String token = admin();
            long before = num(body(Routes.Admin.ANALYTICS_SLA, token), "$.pendingBreachingCount");

            UUID id = listing("0052", PropertyStatus.PENDING, 2400);
            jdbc.update("update properties set resubmitted_at = now() - interval '1 hour' where id = ?", id);

            String json = body(Routes.Admin.ANALYTICS_SLA, token);
            assertThat(num(json, "$.pendingBreachingCount") - before)
                    .as("an hour in the queue is inside a 24-hour target")
                    .isZero();
            List<Number> waits = JsonPath.read(json,
                    "$.worstPending[?(@.id == '" + id + "')].hoursWaiting");
            assertThat(waits).allSatisfy(w -> assertThat(w.doubleValue()).isLessThan(24.0));
        }

        @Test
        void theOffenderListIsLongestWaitingFirstAndCapped() throws Exception {
            listing("0023", PropertyStatus.PENDING, 5000);

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());
            List<Number> waits = JsonPath.read(json, "$.worstPending[*].hoursWaiting");

            assertThat(waits).as("the fixture guarantees at least one").isNotEmpty();
            assertThat(waits).hasSizeLessThanOrEqualTo(10);
            assertThat(waits.stream().map(Number::doubleValue).toList())
                    .isSortedAccordingTo(java.util.Comparator.reverseOrder());
            assertThat(waits.get(0).doubleValue())
                    .as("a listing waiting 5000 hours is the worst offender there is")
                    .isGreaterThanOrEqualTo(5000.0);
        }
    }

    @Nested
    @DisplayName("ticket and concierge turnaround")
    class Tracks {
        @Test
        void everyTrackServesItsOwnTarget() throws Exception {
            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat((int) num(json, "$.ticketPickup.targetHours")).isEqualTo(4);
            assertThat((int) num(json, "$.ticketDelivery.targetHours")).isEqualTo(72);
            assertThat((int) num(json, "$.conciergeToLive.targetHours")).isEqualTo(168);
        }

        @Test
        void pickupIsTheFirstRealAssignment_notTheColumnAndNotTheUnassignment() throws Exception {
            clearRecordedTicketUpdates();
            UUID t = ticket("Rent agreement draft", "open", 400);
            recordTicketUpdate(t, 2, "in-progress", UUID.randomUUID().toString());
            recordTicketUpdate(t, 26, "open", "none");

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.ticketPickup.completedCount"))
                    .as("two rows describe one ticket that was picked up once")
                    .isEqualTo(1);
            assertThat(((Number) JsonPath.read(json, "$.ticketPickup.avgHours")).doubleValue())
                    .as("2 = first real assignment; 26 = the unassignment counted as a pickup")
                    .isEqualTo(2.0);
        }

        @Test
        void anUnownedTicketIsOutstandingAndPastTheTargetIsBreaching() throws Exception {
            clearRecordedTicketUpdates();
            ticket("Unowned and old", "open", 9);
            ticket("Unowned and fresh", "open", 1);
            UUID owned = ticket("Owned and old", "in-progress", 9);
            assignTicket(owned, users.saveAndFlush(ownedBy("9877750011")).getId());

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.ticketPickup.outstandingCount"))
                    .as("only the two nobody has taken")
                    .isEqualTo(2);
            assertThat(num(json, "$.ticketPickup.outstandingBreachingCount"))
                    .as("only the nine-hour-old one is past a four-hour target")
                    .isEqualTo(1);
        }

        @Test
        void deliveryCountsAClosedTicketAsFinished() throws Exception {
            clearRecordedTicketUpdates();
            UUID resolved = ticket("Resolved", "resolved", 400);
            UUID closed = ticket("Closed unresolved", "closed", 400);
            recordTicketUpdate(resolved, 10, "resolved", null);
            recordTicketUpdate(closed, 90, "closed", null);

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.ticketDelivery.completedCount")).isEqualTo(2);
            assertThat(num(json, "$.ticketDelivery.breachedCount"))
                    .as("90 hours is past the 72-hour target; 10 is not")
                    .isEqualTo(1);
            assertThat(num(json, "$.ticketDelivery.slaRatePct")).isEqualTo(50);
            assertThat(((Number) JsonPath.read(json, "$.ticketDelivery.avgHours")).doubleValue())
                    .as("(10 + 90) / 2")
                    .isEqualTo(50.0);
        }

        @Test
        void conciergeMeasuresTheApproval_notTheFirstDecision() throws Exception {
            clearRecordedDecisions();
            UUID id = listing("0040", PropertyStatus.APPROVED, 400);
            jdbc.update("update properties set posted_by_admin = true where id = ?", id);
            recordStatusDecision(id, 4, "pending");
            recordStatusDecision(id, 200, "approved");

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.conciergeToLive.completedCount")).isEqualTo(1);
            assertThat(((Number) JsonPath.read(json, "$.conciergeToLive.avgHours")).doubleValue())
                    .as("200 = went live; 4 = somebody merely looked at it")
                    .isEqualTo(200.0);
            assertThat(num(json, "$.conciergeToLive.breachedCount"))
                    .as("200 hours is past a 168-hour target")
                    .isEqualTo(1);
        }

        @Test
        void aVerificationChecklistApprovalCountsAsGoingLive() throws Exception {
            clearRecordedDecisions();
            UUID id = listing("0049", PropertyStatus.APPROVED, 400);
            jdbc.update("update properties set posted_by_admin = true where id = ?", id);
            recordChecklistDecision(id, 30, "approved");

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.conciergeToLive.completedCount")).isEqualTo(1);
            assertThat(((Number) JsonPath.read(json, "$.conciergeToLive.avgHours")).doubleValue()).isEqualTo(30.0);
        }

        @Test
        void anOwnerPostedListingIsNotConciergeWork() throws Exception {
            clearRecordedDecisions();
            recordStatusDecision(listing("0041", PropertyStatus.APPROVED, 400), 12, "approved");

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            assertThat(num(json, "$.conciergeToLive.completedCount")).isZero();
            assertThat(num(json, "$.reviewedCount"))
                    .as("the same listing does count as a review, which is what makes this a filter"
                            + " rather than a fixture that failed to arrive")
                    .isEqualTo(1);
        }

        @Test
        void aRejectedConciergeListingIsNotStillPending() throws Exception {
            String token = admin();
            long before = num(body(Routes.Admin.ANALYTICS_SLA, token),
                    "$.conciergeToLive.outstandingCount");

            UUID rejected = listing("0042", PropertyStatus.REJECTED, 400);
            UUID pending = listing("0043", PropertyStatus.PENDING, 400);
            jdbc.update("update properties set posted_by_admin = true where id in (?, ?)",
                    rejected, pending);

            assertThat(num(body(Routes.Admin.ANALYTICS_SLA, token),
                    "$.conciergeToLive.outstandingCount") - before)
                    .as("only the pending one is still on its way to live")
                    .isEqualTo(1);
        }

        @Test
        void withNothingCompletedEveryTrackSaysSoRatherThanClaimingAPerfectRecord()
                throws Exception {
            clearRecordedTicketUpdates();
            clearRecordedDecisions();

            String json = body(Routes.Admin.ANALYTICS_SLA, admin());

            for (String track : List.of("ticketPickup", "ticketDelivery", "conciergeToLive")) {
                assertThat(num(json, "$." + track + ".completedCount")).as(track).isZero();
                assertThat((Object) JsonPath.read(json, "$." + track + ".avgHours"))
                        .as(track + ": 0h would claim instantaneous service")
                        .isNull();
                assertThat((Object) JsonPath.read(json, "$." + track + ".medianHours"))
                        .as(track).isNull();
                assertThat((Object) JsonPath.read(json, "$." + track + ".slaRatePct"))
                        .as(track + ": 100% would claim a flawless record")
                        .isNull();
            }
        }

        @Test
        void theWindowFiltersOnWhenTheWorkWasFinished() throws Exception {
            clearRecordedTicketUpdates();
            recordTicketUpdate(ticket("Old and long done", "resolved", 2400), 24, "resolved", null);
            recordTicketUpdate(ticket("Old and just done", "resolved", 2400), 2376, "resolved", null);

            String token = admin();
            assertThat(num(body(Routes.Admin.ANALYTICS_SLA, token),
                    "$.ticketDelivery.completedCount"))
                    .as("all time sees both")
                    .isEqualTo(2);
            assertThat(num(body(Routes.Admin.ANALYTICS_SLA + "?days=30", token),
                    "$.ticketDelivery.completedCount"))
                    .as("only the one finished inside the window, however old the ticket is")
                    .isEqualTo(1);
        }

        private User ownedBy(String mobile) {
            User u = new User(mobile, Roles.Wire.STAFF);
            u.setName("SLA assignee");
            u.setMobileVerified(true);
            return u;
        }
    }
}
