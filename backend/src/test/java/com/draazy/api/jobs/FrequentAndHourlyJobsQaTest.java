package com.draazy.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.billing.plan.SubscriptionSweeper;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.identity.user.User;
import com.draazy.api.jobs.ScheduledJob.Group;
import com.draazy.api.provider.PaymentGateway;
import java.sql.Date;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.util.AopTestUtils;
import org.springframework.test.util.ReflectionTestUtils;

@DisplayName("FREQUENT and HOURLY scheduled jobs, run end to end on committed rows")
class FrequentAndHourlyJobsQaTest extends AbstractJobQaTest {

    private static final String PLAN_OWNER_PLUS = "b1000000-0000-4000-8000-000000000002";
    private static final String PLAN_SEEKER_PLUS = "b1000000-0000-4000-8000-000000000004";
    private static final String PLAN_LISTING_PASS = "b1000000-0000-4000-8000-000000000005";
    private static final String PLAN_CONTACT_PACK = "b1000000-0000-4000-8000-000000000006";
    private static final String MINE = "97915010%";
    private static final String QA_LOCALITY_SLUG = "committed-smoke-qa-hourly";
    private static final String QA_REFUND_CALLS =
            "select count(*) from provider_call where operation = 'refund' and reference like 'qa-ord-%'";

    @Autowired
    private SubscriptionSweeper sweeper;

    @Override
    protected String mobilePrefix() {
        return "97915010";
    }

    @BeforeEach
    void dropOrphans() {
        liveLocality("QA Hourly");
        liveLocality("QA Elsewhere");
        jdbc.update("delete from review_messages where review_id not in (select id from property_reviews)");
        jdbc.update("delete from property_review_checklist where review_id not in (select id from property_reviews)");
    }

    @AfterEach
    void removeRowsThePurgeCannotReach() {
        jdbc.update("""
                delete from audit_log where entity_id in (
                    select id::text from subscriptions where user_id in (select id from users where mobile like ?)
                    union select id::text from properties where owner_id in (select id from users where mobile like ?)
                    union select id::text from service_requests
                          where requester_id in (select id from users where mobile like ?))
                """, MINE, MINE, MINE);
        jdbc.update("""
                delete from review_messages where review_id in (
                    select r.id from property_reviews r join properties p on p.id = r.property_id
                    where p.owner_id in (select id from users where mobile like ?))
                """, MINE);
        jdbc.update("""
                delete from property_review_checklist where review_id in (
                    select r.id from property_reviews r join properties p on p.id = r.property_id
                    where p.owner_id in (select id from users where mobile like ?))
                """, MINE);
        jdbc.update("""
                delete from service_request_timeline where request_id in (
                    select id from service_requests where requester_id in (select id from users where mobile like ?))
                """, MINE);
        jdbc.update("delete from provider_call where reference like 'qa-ord-%' or reference like 'qa-poison-%'");
        jdbc.update("delete from page_views where session_id like 'qa-pv-%'");
        LocalDate today = LocalDate.now(PlatformTime.IST);
        for (String table : List.of("page_view_daily", "page_view_daily_paths", "page_view_daily_referrers")) {
            jdbc.update("delete from " + table + " where day between ? and ?",
                    Date.valueOf(today.minusDays(5)), Date.valueOf(today.plusDays(1)));
        }
    }

    private static Timestamp ts(Instant instant) {
        return Timestamp.from(instant);
    }

    private static Instant ago(Duration age) {
        return Instant.now().minus(age);
    }

    private static Instant ahead(Duration age) {
        return Instant.now().plus(age);
    }

    private UUID subscription(User owner, String plan, UUID propertyId, String status, Instant createdAt,
            Instant renewsAt, String paymentRef) {
        return jdbc.queryForObject("""
                insert into subscriptions (user_id, plan_id, property_id, status, amount, started_at, renews_at,
                                           payment_ref, idempotency_key, created_at)
                values (?, ?::uuid, ?, ?, 999, ?, ?, ?, ?, ?) returning id
                """, UUID.class, owner.getId(), plan, propertyId, status, ts(createdAt),
                renewsAt == null ? null : ts(renewsAt), paymentRef,
                paymentRef == null ? null : "idem-" + paymentRef, ts(createdAt));
    }

    private UUID dueRefund(User owner, String ref, Instant dueAt, Long amount, int attempts) {
        return jdbc.queryForObject("""
                insert into subscriptions (user_id, plan_id, status, amount, started_at, payment_ref, created_at,
                                           refund_due_at, refund_amount, refund_attempts)
                values (?, ?::uuid, 'cancelled', 999, ?, ?, ?, ?, ?, ?) returning id
                """, UUID.class, owner.getId(), PLAN_LISTING_PASS, ts(dueAt.minusSeconds(600)), ref,
                ts(dueAt.minusSeconds(600)), ts(dueAt), amount, attempts);
    }

    private UUID property(User owner, String status, Instant createdAt) {
        return jdbc.queryForObject("""
                insert into properties (owner_id, title, deal, property_type, price, locality, city, status,
                                        created_at, bhk, locality_slug)
                values (?, 'QA flat', 'rent', 'apartment', 25000, 'QA Hourly', 'Pune', ?, ?, 99, ?) returning id
                """, UUID.class, owner.getId(), status, ts(createdAt), QA_LOCALITY_SLUG);
    }

    private void archive(UUID propertyId) {
        jdbc.update("update properties set archived = true, archived_at = now() where id = ?", propertyId);
    }

    private String propertyStatus(UUID id) {
        return jdbc.queryForObject("select status from properties where id = ?", String.class, id);
    }

    private Map<String, Object> subscriptionRow(UUID id) {
        return jdbc.queryForMap("select * from subscriptions where id = ?", id);
    }

    private String subscriptionStatus(UUID id) {
        return jdbc.queryForObject("select status from subscriptions where id = ?", String.class, id);
    }

    private long notifications(User user, String type) {
        return count("select count(*) from notifications where user_id = ? and type = ?", user.getId(), type);
    }

    private long audits(String action, UUID entityId) {
        return count("select count(*) from audit_log where action = ? and entity_id = ?", action,
                entityId.toString());
    }

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    private void awaitCount(long expected, String sql, Object... args) throws InterruptedException {
        for (int i = 0; i < 50 && count(sql, args) != expected; i++) {
            Thread.sleep(100);
        }
        assertThat(count(sql, args)).isEqualTo(expected);
    }

    @Nested
    @DisplayName("abandoned-checkouts")
    class AbandonedCheckouts {

        @Test
        @DisplayName("an unpaid subscription checkout is cancelled once its 45 minutes are up, never earlier")
        void staleSubscriptionCheckoutsAreCancelled() {
            User stale = user("01", "owner");
            User fresh = user("02", "owner");
            User neverOpened = user("03", "owner");
            User paid = user("04", "owner");
            UUID staleRow = subscription(stale, PLAN_LISTING_PASS, null, "pending", ago(Duration.ofMinutes(46)),
                    null, "qa-ord-stale");
            UUID freshRow = subscription(fresh, PLAN_LISTING_PASS, null, "pending", ago(Duration.ofMinutes(44)),
                    null, "qa-ord-fresh");
            UUID unopened = subscription(neverOpened, PLAN_LISTING_PASS, null, "pending", ago(Duration.ofDays(3)),
                    null, null);
            UUID active = subscription(paid, PLAN_CONTACT_PACK, null, "active", ago(Duration.ofDays(3)),
                    ahead(Duration.ofDays(20)), "qa-ord-paid");
            List<UUID> settled = List.of(
                    subscription(paid, PLAN_CONTACT_PACK, null, "cancelled", ago(Duration.ofDays(3)), null, null),
                    subscription(paid, PLAN_CONTACT_PACK, null, "expired", ago(Duration.ofDays(9)),
                            ago(Duration.ofDays(2)), null),
                    subscription(paid, PLAN_CONTACT_PACK, null, "refund-review", ago(Duration.ofDays(3)),
                            ahead(Duration.ofDays(2)), null),
                    subscription(paid, PLAN_CONTACT_PACK, null, "disputed", ago(Duration.ofDays(3)),
                            ahead(Duration.ofDays(2)), null),
                    subscription(paid, PLAN_CONTACT_PACK, null, "refunded", ago(Duration.ofDays(3)),
                            ahead(Duration.ofDays(2)), null));
            Map<UUID, Object> versions = new HashMap<>();
            settled.forEach(id -> versions.put(id, subscriptionRow(id).get("version")));

            runGroup(Group.FREQUENT);

            assertThat(touched("abandoned-checkouts")).isEqualTo(2);
            assertThat(subscriptionStatus(staleRow)).isEqualTo("cancelled");
            assertThat(subscriptionStatus(unopened)).isEqualTo("cancelled");
            assertThat(subscriptionStatus(freshRow)).isEqualTo("pending");
            assertThat(subscriptionStatus(active)).isEqualTo("active");
            Map<String, Object> cancelled = subscriptionRow(staleRow);
            assertThat(cancelled.get("idempotency_key")).as("key released so the buyer can retry").isNull();
            assertThat(cancelled.get("payment_ref")).isEqualTo("qa-ord-stale");
            assertThat(cancelled.get("refund_due_at")).isNull();
            settled.forEach(id -> assertThat(subscriptionRow(id).get("version")).isEqualTo(versions.get(id)));

            runGroup(Group.FREQUENT);

            assertThat(touched("abandoned-checkouts")).isZero();
            assertThat(subscriptionStatus(freshRow)).isEqualTo("pending");
            assertThat(subscriptionRow(staleRow).get("version")).isEqualTo(cancelled.get("version"));
        }

        @Test
        @DisplayName("an unpaid service request is cancelled on its own, longer clock and leaves a timeline entry")
        void staleServiceRequestsAreCancelled() {
            UUID checkoutStale = serviceRequest(user("05", "owner"), "qa-ord-sr1", ago(Duration.ofMinutes(46)));
            UUID checkoutFresh = serviceRequest(user("06", "owner"), "qa-ord-sr2", ago(Duration.ofMinutes(44)));
            UUID filedYesterday = serviceRequest(user("07", "owner"), null, ago(Duration.ofDays(2)));
            UUID filedLongAgo = serviceRequest(user("08", "owner"), null, ago(Duration.ofDays(31)));
            UUID paidOld = serviceRequest(user("09", "owner"), "qa-ord-sr3", ago(Duration.ofDays(40)));
            jdbc.update("update service_requests set status = 'new' where id = ?", paidOld);

            runGroup(Group.FREQUENT);

            assertThat(touched("abandoned-checkouts")).isEqualTo(2);
            assertThat(serviceStatus(checkoutStale)).isEqualTo("cancelled");
            assertThat(serviceStatus(filedLongAgo)).isEqualTo("cancelled");
            assertThat(serviceStatus(checkoutFresh)).isEqualTo("awaiting-payment");
            assertThat(serviceStatus(filedYesterday)).isEqualTo("awaiting-payment");
            assertThat(serviceStatus(paidOld)).isEqualTo("new");
            assertThat(count("select count(*) from service_request_timeline where request_id = ? and event = ?",
                    checkoutStale, "payment.abandoned")).isEqualTo(1);
            assertThat(count("select count(*) from service_request_timeline where request_id = ?", paidOld))
                    .isZero();

            runGroup(Group.FREQUENT);

            assertThat(touched("abandoned-checkouts")).isZero();
            assertThat(count("select count(*) from service_request_timeline where request_id = ? and event = ?",
                    checkoutStale, "payment.abandoned")).isEqualTo(1);
        }

        private UUID serviceRequest(User requester, String paymentRef, Instant updatedAt) {
            return jdbc.queryForObject("""
                    insert into service_requests (requester_id, type, status, team, amount, payment_ref, created_at,
                                                  updated_at, status_changed_at)
                    values (?, 'legal', 'awaiting-payment', 'legal', 1500, ?, ?, ?, ?) returning id
                    """, UUID.class, requester.getId(), paymentRef, ts(updatedAt.minusSeconds(60)), ts(updatedAt),
                    ts(updatedAt));
        }

        private String serviceStatus(UUID id) {
            return jdbc.queryForObject("select status from service_requests where id = ?", String.class, id);
        }
    }

    @Nested
    @DisplayName("pass-refunds")
    class PassRefunds {

        @Test
        @DisplayName("every recorded refund goes to the gateway once, is stored and audited, and is not sent again")
        void dueRefundsAreSentOnce() throws InterruptedException {
            User owner = user("11", "owner");
            UUID plain = dueRefund(owner, "qa-ord-r1", ago(Duration.ofMinutes(5)), null, 0);
            UUID partial = dueRefund(owner, "qa-ord-r2", ago(Duration.ofMinutes(4)), 500L, 0);
            UUID retried = dueRefund(owner, "qa-ord-r3", ago(Duration.ofMinutes(3)), null, 1);
            UUID notDue = subscription(owner, PLAN_LISTING_PASS, null, "active", ago(Duration.ofDays(1)),
                    ahead(Duration.ofDays(30)), "qa-ord-r4");
            UUID alreadySent = dueRefund(owner, "qa-ord-r5", ago(Duration.ofHours(2)), null, 0);
            jdbc.update("update subscriptions set refund_ref = 're_done' where id = ?", alreadySent);

            runGroup(Group.FREQUENT);

            assertThat(touched("pass-refunds")).isEqualTo(3);
            assertThat(subscriptionRow(plain).get("refund_ref"))
                    .isEqualTo("mock_refund_lp_" + plain.toString().replace("-", ""));
            assertThat(subscriptionRow(partial).get("refund_ref"))
                    .isEqualTo("mock_refund_lp_" + partial.toString().replace("-", ""));
            assertThat(subscriptionRow(retried).get("refund_ref"))
                    .isEqualTo("mock_refund_lp_" + retried.toString().replace("-", "") + "_1");
            assertThat(subscriptionRow(notDue).get("refund_ref")).isNull();
            assertThat(subscriptionRow(alreadySent).get("refund_ref")).isEqualTo("re_done");
            assertThat(audits("subscription.passRefunded", plain)).isEqualTo(1);
            assertThat(audits("subscription.passRefunded", partial)).isEqualTo(1);
            assertThat(audits("subscription.passRefunded", alreadySent)).isZero();
            assertThat(jdbc.queryForObject("""
                    select metadata->>'amount' from audit_log
                    where action = 'subscription.passRefunded' and entity_id = ?
                    """, String.class, partial.toString())).isEqualTo("500");
            awaitCount(3, QA_REFUND_CALLS);

            runGroup(Group.FREQUENT);

            assertThat(touched("pass-refunds")).isZero();
            assertThat(audits("subscription.passRefunded", plain)).isEqualTo(1);
            Thread.sleep(300);
            assertThat(count(QA_REFUND_CALLS)).isEqualTo(3);
        }

        @Test
        @DisplayName("a backlog of 55 due refunds is worked off 50 per run and then goes quiet")
        void refundsAreCappedPerRun() throws InterruptedException {
            User owner = user("12", "owner");
            for (int i = 0; i < 55; i++) {
                dueRefund(owner, "qa-ord-bulk-" + i, ago(Duration.ofMinutes(60 - i)), null, 0);
            }

            runGroup(Group.FREQUENT);
            assertThat(touched("pass-refunds")).isEqualTo(50);
            runGroup(Group.FREQUENT);
            assertThat(touched("pass-refunds")).isEqualTo(5);
            runGroup(Group.FREQUENT);
            assertThat(touched("pass-refunds")).isZero();

            assertThat(count("select count(*) from subscriptions where user_id = ? and refund_ref is null",
                    owner.getId())).isZero();
            awaitCount(55, QA_REFUND_CALLS);
        }

        @Test
        @DisplayName("refunds the gateway keeps refusing yield to a newer refund by the next tick")
        void refusedRefundsDoNotStarveOthers() {
            Object target = AopTestUtils.getUltimateTargetObject(sweeper);
            Object passes = ReflectionTestUtils.getField(target, "passes");
            Object original = ReflectionTestUtils.getField(passes, "gateway");
            User owner = user("13", "owner");
            for (int i = 0; i < 50; i++) {
                dueRefund(owner, "qa-poison-" + i, ago(Duration.ofHours(3)), null, 0);
            }
            UUID healthy = dueRefund(owner, "qa-ord-healthy", ago(Duration.ofMinutes(1)), null, 0);
            ReflectionTestUtils.setField(passes, "gateway", new RefusingGateway());
            try {
                runGroup(Group.FREQUENT);
                runGroup(Group.FREQUENT);
            } finally {
                ReflectionTestUtils.setField(passes, "gateway", original);
            }

            assertThat(subscriptionRow(healthy).get("refund_ref")).isNotNull();
        }
    }

    private static final class RefusingGateway implements PaymentGateway {

        @Override
        public PaymentOrder createOrder(long amountInr, String reference, Customer customer) {
            throw new UnsupportedOperationException();
        }

        @Override
        public Optional<String> resumeSession(String orderId) {
            return Optional.empty();
        }

        @Override
        public boolean paid(String orderId) {
            return false;
        }

        @Override
        public boolean lastAttemptFailed(String orderId) {
            return false;
        }

        @Override
        public String refund(String orderId, long amountInr, String refundId, String note) {
            if (orderId.startsWith("qa-poison-")) {
                throw new IllegalStateException("gateway refuses " + orderId);
            }
            return "stub_" + refundId;
        }

        @Override
        public Optional<String> findRefund(String orderId, String refundId) {
            return Optional.empty();
        }
    }

    @Nested
    @DisplayName("listing-duplicates")
    class ListingDuplicates {

        @Test
        @DisplayName("recent listings that collide get one staff-only note each, and a second tick adds nothing")
        void collidingRecentListingsAreFlaggedOnce() {
            User a = user("21", "owner");
            User b = user("22", "owner");
            User c = user("23", "owner");
            User d = user("24", "owner");
            User e = user("25", "owner");
            User f = user("26", "owner");
            User g = user("27", "owner");
            UUID p1 = signalled(a, "approved", Duration.ofMinutes(10), "qa-meter-1", null);
            UUID p2 = signalled(b, "pending", Duration.ofMinutes(5), "qa-meter-1", null);
            UUID p3 = signalled(c, "pending", Duration.ofMinutes(29), null, "qa-addr-1");
            UUID p4 = signalled(d, "pending", Duration.ofMinutes(31), null, "qa-addr-1");
            UUID sameOwner1 = signalled(e, "pending", Duration.ofMinutes(8), "qa-meter-2", null);
            UUID sameOwner2 = signalled(e, "pending", Duration.ofMinutes(7), "qa-meter-2", null);
            UUID rejected = signalled(f, "rejected", Duration.ofMinutes(6), "qa-meter-3", null);
            UUID againstRejected = signalled(g, "pending", Duration.ofMinutes(5), "qa-meter-3", null);
            UUID archived = signalled(f, "pending", Duration.ofMinutes(6), "qa-meter-4", null);
            archive(archived);
            UUID againstArchived = signalled(g, "pending", Duration.ofMinutes(5), "qa-meter-4", null);
            UUID unsignalled = signalled(a, "pending", Duration.ofMinutes(2), null, null);

            runGroup(Group.FREQUENT);

            assertThat(touched("listing-duplicates")).isEqualTo(7);
            for (UUID flagged : List.of(p1, p2, p3)) {
                assertThat(internalNotes(flagged)).as("notes on %s", flagged).hasSize(1);
                assertThat(internalNotes(flagged).get(0)).contains("Possible duplicate");
            }
            assertThat(internalNotes(p2).get(0)).contains("matches an active listing by another owner");
            for (UUID quiet : List.of(p4, sameOwner1, sameOwner2, rejected, againstRejected, archived,
                    againstArchived, unsignalled)) {
                assertThat(internalNotes(quiet)).as("notes on %s", quiet).isEmpty();
            }
            assertThat(count("select count(*) from review_messages where internal = false and review_id in "
                    + "(select id from property_reviews where property_id in (?, ?, ?))", p1, p2, p3)).isZero();

            runGroup(Group.FREQUENT);

            for (UUID flagged : List.of(p1, p2, p3)) {
                assertThat(internalNotes(flagged)).as("notes on %s", flagged).hasSize(1);
            }
            assertThat(propertyStatus(p1)).isEqualTo("approved");
        }

        @Test
        @DisplayName("two owners reusing the same photographs are flagged even with no address or meter")
        void photoOnlyDuplicatesAreFlagged() {
            UUID first = signalled(user("28", "owner"), "pending", Duration.ofMinutes(9), null, null);
            UUID second = signalled(user("29", "owner"), "pending", Duration.ofMinutes(8), null, null);
            long base = 0x5A5A_1234_ABCD_9876L;
            jdbc.update("insert into property_photo_hashes (property_id, hash) values (?, ?)", first, base);
            jdbc.update("insert into property_photo_hashes (property_id, hash) values (?, ?)", second,
                    base ^ 0b10101L);

            runGroup(Group.FREQUENT);

            assertThat(touched("listing-duplicates")).isEqualTo(2);
            assertThat(internalNotes(first)).hasSize(1);
            assertThat(internalNotes(first).get(0)).contains("reuses photographs");
            assertThat(internalNotes(second)).hasSize(1);
        }

        private UUID signalled(User owner, String status, Duration age, String meterKey, String addressKey) {
            UUID id = property(owner, status, ago(age));
            jdbc.update("update properties set electricity_meter_key = ?, address_key = ? where id = ?",
                    meterKey, addressKey, id);
            return id;
        }

        private List<String> internalNotes(UUID propertyId) {
            return jdbc.queryForList("""
                    select m.body from review_messages m join property_reviews r on r.id = m.review_id
                    where r.property_id = ? and m.internal order by m.created_at
                    """, String.class, propertyId);
        }
    }

    @Nested
    @DisplayName("subscription-expiry")
    class SubscriptionExpiry {

        @Test
        @DisplayName("only active terms that have ended expire, and nothing else about the account changes")
        void onlyLapsedActiveTermsExpire() {
            User owner = user("31", "owner");
            UUID lapsedPack = subscription(owner, PLAN_CONTACT_PACK, null, "active", ago(Duration.ofDays(31)),
                    ago(Duration.ofMinutes(1)), "qa-ord-e1");
            UUID lapsedSeekerPlan = subscription(owner, PLAN_SEEKER_PLUS, null, "active", ago(Duration.ofDays(31)),
                    ago(Duration.ofDays(1)), "qa-ord-e2");
            UUID runningPack = subscription(owner, PLAN_CONTACT_PACK, null, "active", ago(Duration.ofDays(20)),
                    ahead(Duration.ofMinutes(5)), "qa-ord-e3");
            UUID openEnded = subscription(owner, PLAN_CONTACT_PACK, null, "active", ago(Duration.ofDays(31)),
                    null, "qa-ord-e4");
            UUID pending = subscription(owner, PLAN_CONTACT_PACK, null, "pending", ago(Duration.ofMinutes(2)),
                    null, "qa-ord-e5");
            Map<UUID, String> untouched = new LinkedHashMap<>();
            for (String status : List.of("cancelled", "refund-review", "disputed", "refunded", "expired")) {
                untouched.put(subscription(owner, PLAN_CONTACT_PACK, null, status, ago(Duration.ofDays(31)),
                        ago(Duration.ofDays(1)), null), status);
            }

            runGroup(Group.HOURLY);

            assertThat(touched("subscription-expiry")).isEqualTo(2);
            assertThat(subscriptionStatus(lapsedPack)).isEqualTo("expired");
            assertThat(subscriptionStatus(lapsedSeekerPlan)).isEqualTo("expired");
            assertThat(subscriptionStatus(runningPack)).isEqualTo("active");
            assertThat(subscriptionStatus(openEnded)).isEqualTo("active");
            assertThat(subscriptionStatus(pending)).isEqualTo("pending");
            untouched.forEach((id, status) -> assertThat(subscriptionStatus(id)).isEqualTo(status));
            assertThat(subscriptionRow(lapsedPack).get("payment_ref")).isEqualTo("qa-ord-e1");
            assertThat(subscriptionRow(lapsedPack).get("refund_due_at")).isNull();
            assertThat(count("select count(*) from notifications where user_id = ?", owner.getId())).isZero();

            Object versionAfterFirstRun = subscriptionRow(lapsedPack).get("version");
            runGroup(Group.HOURLY);

            assertThat(touched("subscription-expiry")).isZero();
            assertThat(subscriptionRow(lapsedPack).get("version")).isEqualTo(versionAfterFirstRun);
        }

        @Test
        @DisplayName("a lapsed listing pass pauses its listing only when the free slot is taken, and tells the owner once")
        void lapsedPassesPauseOnlyWhatTheFreeTierCannotHold() {
            User crowded = user("32", "owner");
            UUID uncovered = property(crowded, "approved", ago(Duration.ofDays(30)));
            UUID passLapsed = property(crowded, "approved", ago(Duration.ofDays(20)));
            UUID passRunning = property(crowded, "approved", ago(Duration.ofDays(10)));
            UUID lapsedSub = subscription(crowded, PLAN_LISTING_PASS, passLapsed, "active", ago(Duration.ofDays(61)),
                    ago(Duration.ofHours(1)), "qa-ord-p1");
            UUID runningSub = subscription(crowded, PLAN_LISTING_PASS, passRunning, "active", ago(Duration.ofDays(5)),
                    ahead(Duration.ofDays(55)), "qa-ord-p2");

            User sole = user("33", "owner");
            UUID soleListing = property(sole, "approved", ago(Duration.ofDays(30)));
            UUID soleSub = subscription(sole, PLAN_LISTING_PASS, soleListing, "active", ago(Duration.ofDays(61)),
                    ago(Duration.ofHours(1)), "qa-ord-p3");

            User resting = user("34", "owner");
            UUID pausedListing = property(resting, "paused", ago(Duration.ofDays(30)));
            UUID pausedSub = subscription(resting, PLAN_LISTING_PASS, pausedListing, "active", ago(Duration.ofDays(61)),
                    ago(Duration.ofHours(1)), "qa-ord-p4");

            User gone = user("35", "owner");
            UUID goneListing = property(gone, "approved", ago(Duration.ofDays(30)));
            archive(goneListing);
            UUID goneSub = subscription(gone, PLAN_LISTING_PASS, goneListing, "active", ago(Duration.ofDays(61)),
                    ago(Duration.ofHours(1)), "qa-ord-p5");

            User waiting = user("36", "owner");
            UUID pendingListing = property(waiting, "pending", ago(Duration.ofDays(2)));
            UUID pendingSub = subscription(waiting, PLAN_LISTING_PASS, pendingListing, "active", ago(Duration.ofDays(61)),
                    ago(Duration.ofHours(1)), "qa-ord-p6");

            runGroup(Group.HOURLY);

            assertThat(touched("subscription-expiry")).isEqualTo(5);
            assertThat(propertyStatus(uncovered)).isEqualTo("approved");
            assertThat(propertyStatus(passLapsed)).isEqualTo("paused");
            assertThat(propertyStatus(passRunning)).isEqualTo("approved");
            assertThat(propertyStatus(soleListing)).isEqualTo("approved");
            assertThat(propertyStatus(pausedListing)).isEqualTo("paused");
            assertThat(propertyStatus(goneListing)).isEqualTo("approved");
            assertThat(propertyStatus(pendingListing)).isEqualTo("pending");
            for (UUID sub : List.of(lapsedSub, soleSub, pausedSub, goneSub, pendingSub)) {
                assertThat(subscriptionStatus(sub)).isEqualTo("expired");
            }
            assertThat(subscriptionStatus(runningSub)).isEqualTo("active");
            assertThat(notifications(crowded, "listing.pass_ended")).isEqualTo(1);
            assertThat(audits("property.passLapsedPause", passLapsed)).isEqualTo(1);
            assertThat(count("select count(*) from audit_log where action = 'property.passLapsedPause'"
                    + " and entity_id in (?, ?, ?, ?, ?, ?)", uncovered.toString(), passRunning.toString(),
                    soleListing.toString(), pausedListing.toString(), goneListing.toString(),
                    pendingListing.toString())).isZero();
            for (User quiet : List.of(sole, resting, gone, waiting)) {
                assertThat(count("select count(*) from notifications where user_id = ?", quiet.getId())).isZero();
            }

            runGroup(Group.HOURLY);

            assertThat(touched("subscription-expiry")).isZero();
            assertThat(notifications(crowded, "listing.pass_ended")).isEqualTo(1);
            assertThat(audits("property.passLapsedPause", passLapsed)).isEqualTo(1);
        }

        @Test
        @DisplayName("a lapsed plan pauses the listings beyond the free tier, keeping the oldest, and tells the owner")
        void lapsedPlanKeepsTheOldestListingLive() {
            User owner = user("37", "owner");
            UUID oldest = property(owner, "approved", ago(Duration.ofDays(30)));
            UUID middle = property(owner, "approved", ago(Duration.ofDays(20)));
            UUID newest = property(owner, "approved", ago(Duration.ofDays(10)));
            UUID rented = property(owner, "rented", ago(Duration.ofDays(40)));
            UUID plan = subscription(owner, PLAN_OWNER_PLUS, null, "active", ago(Duration.ofDays(31)),
                    ago(Duration.ofMinutes(30)), "qa-ord-pl1");

            User subscribed = user("38", "owner");
            UUID first = property(subscribed, "approved", ago(Duration.ofDays(30)));
            UUID second = property(subscribed, "approved", ago(Duration.ofDays(20)));
            UUID runningPlan = subscription(subscribed, PLAN_OWNER_PLUS, null, "active", ago(Duration.ofDays(5)),
                    ahead(Duration.ofDays(25)), "qa-ord-pl2");

            runGroup(Group.HOURLY);

            assertThat(touched("subscription-expiry")).isEqualTo(1);
            assertThat(subscriptionStatus(plan)).isEqualTo("expired");
            assertThat(propertyStatus(oldest)).isEqualTo("approved");
            assertThat(propertyStatus(middle)).isEqualTo("paused");
            assertThat(propertyStatus(newest)).isEqualTo("paused");
            assertThat(propertyStatus(rented)).isEqualTo("rented");
            assertThat(notifications(owner, "listing.plan_ended")).isEqualTo(2);
            assertThat(audits("property.planLapsedPause", middle)).isEqualTo(1);
            assertThat(audits("property.planLapsedPause", newest)).isEqualTo(1);
            assertThat(audits("property.planLapsedPause", oldest)).isZero();
            assertThat(subscriptionStatus(runningPlan)).isEqualTo("active");
            assertThat(List.of(propertyStatus(first), propertyStatus(second))).containsOnly("approved");

            runGroup(Group.HOURLY);

            assertThat(touched("subscription-expiry")).isZero();
            assertThat(notifications(owner, "listing.plan_ended")).isEqualTo(2);
        }

        @Test
        @DisplayName("when every pass lapses together the oldest listing keeps the free slot")
        void passLapseKeepsTheOldestListing() {
            User owner = user("39", "owner");
            UUID oldest = property(owner, "approved", ago(Duration.ofDays(30)));
            UUID middle = property(owner, "approved", ago(Duration.ofDays(20)));
            UUID newest = property(owner, "approved", ago(Duration.ofDays(10)));
            for (UUID listing : List.of(oldest, middle, newest)) {
                subscription(owner, PLAN_LISTING_PASS, listing, "active", ago(Duration.ofDays(61)),
                        ago(Duration.ofHours(1)), "qa-ord-" + listing);
            }

            runGroup(Group.HOURLY);

            assertThat(propertyStatus(oldest)).isEqualTo("approved");
            assertThat(propertyStatus(middle)).isEqualTo("paused");
            assertThat(propertyStatus(newest)).isEqualTo("paused");
        }
    }

    @Nested
    @DisplayName("saved-search-counts")
    class SavedSearchCounts {

        private static final String RENT_FILTERS =
                "{\"deal\":\"rent\",\"localities\":[\"" + QA_LOCALITY_SLUG + "\"],\"bhk\":[99]}";

        private User seeker;
        private User lister;

        @BeforeEach
        void people() {
            seeker = user("41", "owner");
            lister = user("42", "owner");
        }

        private UUID savedSearch(String name, String frequency, Instant lastAlertedAt, Instant baseline) {
            return savedSearch(name, frequency, lastAlertedAt, baseline, RENT_FILTERS);
        }

        private UUID savedSearch(String name, String frequency, Instant lastAlertedAt, Instant baseline,
                String filters) {
            return jdbc.queryForObject("""
                    insert into saved_searches (user_id, name, query, filters, alert_frequency, channel, kind,
                                                last_alerted_at, created_at, updated_at)
                    values (?, ?, 'rent qa', ?::jsonb, ?, 'push', 'listings', ?, ?, ?) returning id
                    """, UUID.class, seeker.getId(), name, filters, frequency,
                    lastAlertedAt == null ? null : ts(lastAlertedAt), ts(baseline), ts(baseline));
        }

        private UUID match(Duration age) {
            return property(lister, "approved", ago(age));
        }

        private int newCount(UUID search) {
            return jdbc.queryForObject("select new_count from saved_searches where id = ?", Integer.class, search);
        }

        private long alerts() {
            return notifications(seeker, "match.saved-search");
        }

        @Test
        @DisplayName("only live, matching listings newer than the search's baseline count, and one alert goes out")
        void newMatchesRaiseTheCountAndAlertOnce() {
            UUID search = savedSearch("QA rent", "instant", null, ago(Duration.ofHours(3)));
            match(Duration.ofMinutes(30));
            match(Duration.ofHours(4));
            property(lister, "pending", ago(Duration.ofMinutes(10)));
            archive(match(Duration.ofMinutes(10)));
            jdbc.update("update properties set deal = 'buy', price = 9000000 where id = ?",
                    match(Duration.ofMinutes(10)));
            jdbc.update("update properties set locality_slug = 'committed-smoke-qa-elsewhere' where id = ?",
                    match(Duration.ofMinutes(10)));
            jdbc.update("update properties set bhk = 98 where id = ?", match(Duration.ofMinutes(10)));

            runGroup(Group.HOURLY);

            assertThat(touched("saved-search-counts")).isEqualTo(1);
            assertThat(newCount(search)).isEqualTo(1);
            assertThat(alerts()).isEqualTo(1);
            Map<String, Object> note = jdbc.queryForMap(
                    "select title, link from notifications where user_id = ? and type = 'match.saved-search'",
                    seeker.getId());
            assertThat(note.get("title")).isEqualTo("1 new home match QA rent");
            assertThat(note.get("link")).isEqualTo("/dashboard#alerts");
            assertThat(count("select count(*) from saved_searches where id = ? and last_alerted_at is not null",
                    search)).isEqualTo(1);

            runGroup(Group.HOURLY);

            assertThat(newCount(search)).as("the baseline moved, so the count falls back").isZero();
            assertThat(alerts()).isEqualTo(1);

            runGroup(Group.HOURLY);

            assertThat(touched("saved-search-counts")).isZero();
            assertThat(alerts()).isEqualTo(1);
        }

        @Test
        @DisplayName("alert frequency decides whether a rise is announced, never whether it is counted")
        void frequencyGatesTheAlertNotTheCount() {
            UUID off = savedSearch("off", "off", null, ago(Duration.ofHours(3)));
            UUID instant = savedSearch("instant", "instant", ago(Duration.ofMinutes(30)), ago(Duration.ofHours(3)));
            UUID dailyCooling = savedSearch("daily-cooling", "daily", ago(Duration.ofHours(2)),
                    ago(Duration.ofHours(3)));
            UUID dailyReady = savedSearch("daily-ready", "daily", ago(Duration.ofHours(25)), ago(Duration.ofHours(3)));
            UUID weeklyCooling = savedSearch("weekly-cooling", "weekly", ago(Duration.ofDays(6)),
                    ago(Duration.ofHours(3)));
            UUID weeklyReady = savedSearch("weekly-ready", "weekly", ago(Duration.ofDays(8)), ago(Duration.ofHours(3)));
            match(Duration.ofMinutes(20));
            match(Duration.ofMinutes(15));

            runGroup(Group.HOURLY);

            assertThat(touched("saved-search-counts")).isEqualTo(6);
            for (UUID id : List.of(off, instant, dailyCooling, dailyReady, weeklyCooling, weeklyReady)) {
                assertThat(newCount(id)).isEqualTo(2);
            }
            assertThat(jdbc.queryForList("select title from notifications where user_id = ? order by title",
                    String.class, seeker.getId())).containsExactly("2 new homes match daily-ready",
                    "2 new homes match instant", "2 new homes match weekly-ready");
            assertThat(count("select count(*) from saved_searches where id = ? and last_alerted_at is null", off))
                    .isEqualTo(1);
        }

        @Test
        @DisplayName("unreadable filter values are ignored, and searches without a deal or flatmate pool count zero")
        void oddSearchesAreHarmless() {
            UUID odd = savedSearch("odd", "instant", null, ago(Duration.ofHours(3)),
                    "{\"deal\":\"rent\",\"rent\":[\"x\",\"y\"],\"bhk\":[\"abc\"],\"minArea\":\"abc\"}");
            UUID noDeal = savedSearch("no deal", "instant", null, ago(Duration.ofHours(3)), "[]");
            UUID flatmates = jdbc.queryForObject("""
                    insert into saved_searches (user_id, name, filters, criteria, alert_frequency, channel, kind,
                                                created_at, updated_at)
                    values (?, 'mates', '{}'::jsonb, '{"tab":"move-in","locality":"Baner","vibe":["pets:1"],
                    "budget":20000,"moveIn":"now"}'::jsonb, 'instant', 'push', 'flatmates', ?, ?) returning id
                    """, UUID.class, seeker.getId(), ts(ago(Duration.ofHours(3))), ts(ago(Duration.ofHours(3))));
            match(Duration.ofMinutes(20));

            runGroup(Group.HOURLY);

            assertThat(touched("saved-search-counts")).isEqualTo(1);
            assertThat(newCount(odd)).isEqualTo(1);
            for (UUID id : List.of(noDeal, flatmates)) {
                assertThat(newCount(id)).isZero();
            }
            assertThat(alerts()).isEqualTo(1);
        }

        @Test
        @DisplayName("a second match arriving after an alert is counted and alerted on the next tick")
        void aMatchAfterAnAlertIsNotLost() {
            UUID search = savedSearch("QA rent", "instant", null, ago(Duration.ofHours(3)));
            match(Duration.ofMinutes(30));
            runGroup(Group.HOURLY);
            assertThat(alerts()).isEqualTo(1);

            match(Duration.ZERO);
            runGroup(Group.HOURLY);

            assertThat(alerts()).as("the second home is announced").isEqualTo(2);
            assertThat(newCount(search)).isEqualTo(1);
        }

        @Test
        @DisplayName("a match found during the cooldown is still pending on the next tick")
        void cooldownDoesNotDropMatches() {
            UUID search = savedSearch("daily", "daily", ago(Duration.ofHours(2)), ago(Duration.ofHours(3)));
            match(Duration.ofMinutes(30));
            runGroup(Group.HOURLY);
            assertThat(alerts()).isZero();
            assertThat(newCount(search)).isEqualTo(1);

            runGroup(Group.HOURLY);

            assertThat(newCount(search)).as("still waiting for the cooldown to end").isEqualTo(1);
        }

        @Test
        @DisplayName("a saved search with an absurd area bound does not stop other users' searches being counted")
        void absurdBoundsDoNotBlockTheRest() {
            savedSearch("absurd", "instant", null, ago(Duration.ofHours(3)),
                    "{\"deal\":\"rent\",\"minArea\":\"1e999999\",\"maxArea\":\"-1e999999\"}");
            UUID healthy = savedSearch("healthy", "instant", null, ago(Duration.ofHours(3)));
            match(Duration.ofMinutes(20));

            runGroup(Group.HOURLY);

            assertThat(newCount(healthy)).isEqualTo(1);
            assertThat(notifications(seeker, "match.saved-search")).isPositive();
        }
    }

    @Nested
    @DisplayName("page-view-rollup")
    class PageViewRollup {

        private final LocalDate today = LocalDate.now(PlatformTime.IST);
        private final LocalDate yesterday = today.minusDays(1);

        private Instant at(LocalDate day, int hour, int minute, int second) {
            return day.atTime(hour, minute, second).atZone(PlatformTime.IST).toInstant();
        }

        private void view(String session, String path, String referrer, String device, boolean signedIn,
                Instant when) {
            jdbc.update("""
                    insert into page_views (session_id, path, referrer_host, device, signed_in, occurred_at)
                    values (?, ?, ?, ?, ?, ?)
                    """, "qa-pv-" + session, path, referrer, device, signedIn, ts(when));
        }

        private Map<String, Object> daily(LocalDate day) {
            List<Map<String, Object>> rows = jdbc.queryForList("select * from page_view_daily where day = ?",
                    Date.valueOf(day));
            return rows.isEmpty() ? new HashMap<>() : new HashMap<>(rows.get(0));
        }

        private long pathMetric(LocalDate day, String path, String column) {
            return jdbc.queryForObject("select " + column + " from page_view_daily_paths where day = ? and path = ?",
                    Long.class, Date.valueOf(day), path);
        }

        private long referrerSessions(LocalDate day, String host) {
            return jdbc.queryForObject(
                    "select sessions from page_view_daily_referrers where day = ? and referrer_host = ?",
                    Long.class, Date.valueOf(day), host);
        }

        private void seedTraffic() {
            view("s1", "/home", "google.com", "mobile", false, at(yesterday, 0, 0, 0));
            view("s1", "/search", null, "mobile", false, at(yesterday, 0, 5, 0));
            view("s2", "/home", null, "desktop", false, at(yesterday, 23, 59, 59));
            view("s3", "/home", "x.com", "tablet", true, at(yesterday, 12, 0, 0));
            view("s4", "/a", null, "mobile", false, at(yesterday, 23, 59, 30));
            view("s4", "/b", null, "mobile", false, at(today, 0, 0, 0));
        }

        @Test
        @DisplayName("sessions, paths and referrers are rebuilt per IST day over yesterday and today only")
        void dailyAggregatesAreRebuiltPerIstDay() {
            view("old", "/old", "old.com", "mobile", false, at(today.minusDays(2), 23, 59, 59));
            jdbc.update("""
                    insert into page_view_daily (day, sessions, anon_sessions, signed_in_sessions, pageviews)
                    values (?, 99, 99, 0, 99)
                    """, Date.valueOf(today.minusDays(2)));
            jdbc.update("insert into page_view_daily_paths (day, path, pageviews) values (?, '/sentinel', 99)",
                    Date.valueOf(today.minusDays(2)));
            jdbc.update("insert into page_view_daily (day, sessions) values (?, 777)", Date.valueOf(yesterday));
            jdbc.update("insert into page_view_daily_paths (day, path, pageviews) values (?, '/ghost', 5)",
                    Date.valueOf(yesterday));
            jdbc.update("insert into page_view_daily_referrers (day, referrer_host, sessions) values (?, 'ghost.com', 5)",
                    Date.valueOf(yesterday));
            seedTraffic();

            runGroup(Group.HOURLY);

            assertThat(touched("page-view-rollup")).isPositive();
            Map<String, Object> y = daily(yesterday);
            assertThat(y.get("sessions")).isEqualTo(4L);
            assertThat(y.get("anon_sessions")).isEqualTo(3L);
            assertThat(y.get("signed_in_sessions")).isEqualTo(1L);
            assertThat(y.get("pageviews")).isEqualTo(5L);
            assertThat(y.get("bounced_sessions")).isEqualTo(3L);
            assertThat(y.get("duration_seconds_total")).isEqualTo(300L);
            assertThat(y.get("mobile_sessions")).isEqualTo(2L);
            assertThat(y.get("tablet_sessions")).isEqualTo(1L);
            assertThat(y.get("desktop_sessions")).isEqualTo(1L);
            Map<String, Object> t = daily(today);
            assertThat(t.get("sessions")).isEqualTo(1L);
            assertThat(t.get("pageviews")).isEqualTo(1L);
            assertThat(t.get("bounced_sessions")).isEqualTo(1L);

            assertThat(pathMetric(yesterday, "/home", "pageviews")).isEqualTo(3L);
            assertThat(pathMetric(yesterday, "/home", "anon_pageviews")).isEqualTo(2L);
            assertThat(pathMetric(yesterday, "/home", "exits")).isEqualTo(2L);
            assertThat(pathMetric(yesterday, "/search", "exits")).isEqualTo(1L);
            assertThat(pathMetric(yesterday, "/a", "exits")).isEqualTo(1L);
            assertThat(pathMetric(today, "/b", "exits")).isEqualTo(1L);
            assertThat(count("select count(*) from page_view_daily_paths where path = '/ghost'")).isZero();
            assertThat(count("select count(*) from page_view_daily_referrers where referrer_host = 'ghost.com'"))
                    .isZero();
            assertThat(referrerSessions(yesterday, "google.com")).isEqualTo(1L);
            assertThat(referrerSessions(yesterday, "x.com")).isEqualTo(1L);
            assertThat(referrerSessions(yesterday, "")).isEqualTo(2L);
            assertThat(referrerSessions(today, "")).isEqualTo(1L);

            assertThat(daily(today.minusDays(2)).get("sessions")).as("older days are never recomputed").isEqualTo(99L);
            assertThat(pathMetric(today.minusDays(2), "/sentinel", "pageviews")).isEqualTo(99L);
            assertThat(count("select count(*) from page_view_daily_paths where day = ? and path = '/old'",
                    Date.valueOf(today.minusDays(2)))).isZero();
        }

        @Test
        @DisplayName("running again changes nothing, and a late batch for yesterday is picked up")
        void rerunsAreIdempotentAndCatchLateViews() {
            seedTraffic();
            runGroup(Group.HOURLY);
            Map<String, Object> first = daily(yesterday);

            runGroup(Group.HOURLY);

            Map<String, Object> second = daily(yesterday);
            first.remove("rolled_up_at");
            second.remove("rolled_up_at");
            assertThat(second).isEqualTo(first);
            assertThat(count("select count(*) from page_view_daily where day in (?, ?)", Date.valueOf(yesterday),
                    Date.valueOf(today))).isEqualTo(2);

            view("late", "/late", "late.com", "desktop", false, at(yesterday, 12, 30, 0));
            runGroup(Group.HOURLY);

            assertThat(daily(yesterday).get("sessions")).isEqualTo(5L);
            assertThat(daily(yesterday).get("desktop_sessions")).isEqualTo(2L);
            assertThat(pathMetric(yesterday, "/late", "pageviews")).isEqualTo(1L);
            assertThat(referrerSessions(yesterday, "late.com")).isEqualTo(1L);
        }

        @Test
        @DisplayName("a quiet day loses its rollup row once its raw views are gone")
        void daysWithoutViewsAreCleared() {
            jdbc.update("insert into page_view_daily (day, sessions, pageviews) values (?, 3, 3)", Date.valueOf(today));
            jdbc.update("insert into page_view_daily_paths (day, path, pageviews) values (?, '/gone', 3)",
                    Date.valueOf(today));

            runGroup(Group.HOURLY);

            assertThat(daily(today)).isEmpty();
            assertThat(count("select count(*) from page_view_daily_paths where path = '/gone'")).isZero();
        }
    }
}
