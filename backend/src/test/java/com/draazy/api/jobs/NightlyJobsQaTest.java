package com.draazy.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.identity.user.User;
import com.draazy.api.jobs.ScheduledJob.Group;
import com.draazy.api.provider.FileStorage;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

@DisplayName("Nightly cleanup jobs run against a real database")
class NightlyJobsQaTest extends AbstractJobQaTest {

    private static final String TAG = "qa-nightly";
    private static final String KEYS = "identity/" + TAG + "/";
    private static final String BULK_MOBILES = "6791502";
    private static final Duration MARGIN = Duration.ofMinutes(10);
    private static final String ID_SECRET = "enc:secret";

    @Autowired
    private FileStorage storage;

    @Value("${draazy.storage.dir}")
    private String storageDir;

    @Override
    protected String mobilePrefix() {
        return "97915020";
    }

    @BeforeEach
    @AfterEach
    void cleanUnlinkedRows() throws IOException {
        jdbc.update("delete from page_views where session_id = ?", TAG);
        jdbc.update("delete from provider_call where reference = ?", TAG);
        jdbc.update("delete from error_event where fingerprint like ?", TAG + "%");
        jdbc.update("delete from audit_log where entity = ?", TAG);
        jdbc.update("delete from identity_storage_deletes where storage_key like ?", KEYS + "%");
        jdbc.update("delete from identity_verification_files where storage_key like ?", KEYS + "%");
        String myRequests = "select id from service_requests where requester_id in"
                + " (select id from users where mobile like ?)";
        jdbc.update("delete from service_request_identities where service_request_id in (" + myRequests + ")",
                mobilePrefix() + "%");
        jdbc.update("delete from service_request_timeline where request_id in (" + myRequests + ")",
                mobilePrefix() + "%");
        jdbc.update("delete from identity_verifications where user_id in (select id from users where mobile like ?)",
                BULK_MOBILES + "%");
        jdbc.update("delete from users where mobile like ?", BULK_MOBILES + "%");
        Path dir = Path.of(storageDir).resolve("identity").resolve(TAG);
        if (Files.exists(dir)) {
            try (Stream<Path> walk = Files.walk(dir)) {
                walk.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
            }
        }
    }

    private static Timestamp ago(Duration d) {
        return Timestamp.from(Instant.now().minus(d));
    }

    private long count(String sql, Object... args) {
        return jdbc.queryForObject(sql, Long.class, args);
    }

    private boolean exists(String table, String idColumn, Object id) {
        return count("select count(*) from " + table + " where " + idColumn + " = ?", id) == 1;
    }

    private boolean onDisk(String key) {
        return Files.exists(Path.of(storageDir).resolve(key));
    }

    private UUID refreshToken(User u, Duration expiresIn, boolean revoked, UUID rotatedFrom) {
        UUID id = UUID.randomUUID();
        Timestamp expiresAt = expiresIn.isNegative() ? ago(expiresIn.negated())
                : Timestamp.from(Instant.now().plus(expiresIn));
        jdbc.update("insert into refresh_tokens (id, user_id, token_hash, rotated_from, revoked, expires_at)"
                + " values (?, ?, ?, ?, ?, ?)", id, u.getId(), UUID.randomUUID().toString(), rotatedFrom, revoked,
                expiresAt);
        return id;
    }

    @Test
    @DisplayName("refresh-tokens deletes only expired tokens and keeps live and revoked-but-unexpired ones")
    void refreshTokensPruneOnlyExpired() {
        User u = user("01", "buyer");
        UUID expired = refreshToken(u, MARGIN.negated(), false, null);
        UUID expiredRevoked = refreshToken(u, Duration.ofDays(-3), true, null);
        UUID live = refreshToken(u, MARGIN, false, null);
        UUID revokedLive = refreshToken(u, Duration.ofDays(1), true, null);

        runGroup(Group.NIGHTLY);

        assertThat(exists("refresh_tokens", "id", expired)).isFalse();
        assertThat(exists("refresh_tokens", "id", expiredRevoked)).isFalse();
        assertThat(exists("refresh_tokens", "id", live)).isTrue();
        assertThat(exists("refresh_tokens", "id", revokedLive)).isTrue();
        assertThat(touched("refresh-tokens")).isEqualTo(2);

        runGroup(Group.NIGHTLY);
        assertThat(touched("refresh-tokens")).isZero();
        assertThat(count("select count(*) from refresh_tokens where user_id = ?", u.getId())).isEqualTo(2);
    }

    @Test
    @DisplayName("refresh-tokens prunes a rotation chain whose every link has expired")
    void refreshTokensPruneFullyExpiredChain() {
        User u = user("02", "buyer");
        UUID first = refreshToken(u, Duration.ofDays(-3), true, null);
        UUID second = refreshToken(u, Duration.ofDays(-2), true, first);
        UUID third = refreshToken(u, MARGIN.negated(), false, second);

        runGroup(Group.NIGHTLY);

        assertThat(count("select count(*) from refresh_tokens where id in (?, ?, ?)", first, second, third)).isZero();
        assertThat(touched("refresh-tokens")).isEqualTo(3);
    }

    @Test
    @DisplayName("refresh-tokens survives an expired parent whose rotated heir is still live")
    void refreshTokensPruneExpiredParentOfLiveHeir() {
        User u = user("03", "buyer");
        UUID parent = refreshToken(u, MARGIN.negated(), true, null);
        UUID heir = refreshToken(u, Duration.ofDays(30), false, parent);
        UUID unrelatedExpired = refreshToken(u, MARGIN.negated(), false, null);

        runGroup(Group.NIGHTLY);

        assertThat(exists("refresh_tokens", "id", heir)).isTrue();
        assertThat(exists("refresh_tokens", "id", unrelatedExpired)).isFalse();
    }

    private UUID referral(User referrer, Duration age, String ip, String device, String deviceId, String status) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into referrals (id, referrer_id, channel, status, at, referred_ip_hash,"
                + " referred_device_hash, referred_device_id_hash, track) values (?, ?, 'seeker', ?, ?, ?, ?, ?, 'seeker')",
                id, referrer.getId(), status, ago(age), ip, device, deviceId);
        return id;
    }

    private void referralCode(User owner, Instant signalsAt, String hash) {
        jdbc.update("insert into referral_codes (user_id, code, referrer_ip_hash, referrer_device_hash,"
                + " referrer_device_id_hash, signals_at) values (?, ?, ?, ?, ?, ?)", owner.getId(),
                "QA" + owner.getMobile(), hash, hash, hash, Timestamp.from(signalsAt));
    }

    private Map<String, Object> referralRow(UUID id) {
        return jdbc.queryForMap("select referred_ip_hash ip, referred_device_hash dev, referred_device_id_hash did,"
                + " status from referrals where id = ?", id);
    }

    @Test
    @DisplayName("referral-signal-retention blanks only digests older than 180 days and keeps the rows")
    void referralSignalsExpireAtTheConfiguredWindow() {
        User referrer = user("10", "buyer");
        Duration window = Duration.ofDays(180);
        UUID old = referral(referrer, window.plus(MARGIN), "ip", "dev", "did", "pending");
        UUID oldRewarded = referral(referrer, window.plus(Duration.ofDays(30)), null, null, "did", "rewarded");
        UUID oldNoDigests = referral(referrer, window.plus(MARGIN), null, null, null, "pending");
        UUID fresh = referral(referrer, window.minus(MARGIN), "ip", "dev", "did", "pending");
        User oldCodeOwner = user("11", "buyer");
        User freshCodeOwner = user("12", "buyer");
        referralCode(oldCodeOwner, Instant.now().minus(window).minus(MARGIN), "h");
        referralCode(freshCodeOwner, Instant.now().minus(window).plus(MARGIN), "h");

        runGroup(Group.NIGHTLY);

        assertThat(referralRow(old)).containsEntry("ip", null).containsEntry("dev", null).containsEntry("did", null)
                .containsEntry("status", "pending");
        assertThat(referralRow(oldRewarded)).containsEntry("did", null).containsEntry("status", "rewarded");
        assertThat(referralRow(oldNoDigests)).containsEntry("ip", null);
        assertThat(referralRow(fresh)).containsEntry("ip", "ip").containsEntry("dev", "dev")
                .containsEntry("did", "did");
        Map<String, Object> oldCode = jdbc.queryForMap("select referrer_ip_hash a, referrer_device_hash b,"
                + " referrer_device_id_hash c, signals_at d from referral_codes where user_id = ?", oldCodeOwner.getId());
        assertThat(oldCode.values()).containsOnlyNulls();
        Map<String, Object> freshCode = jdbc.queryForMap("select referrer_ip_hash a, signals_at d from referral_codes"
                + " where user_id = ?", freshCodeOwner.getId());
        assertThat(freshCode.get("a")).isEqualTo("h");
        assertThat(freshCode.get("d")).isNotNull();
        assertThat(touched("referral-signal-retention")).isEqualTo(3);

        runGroup(Group.NIGHTLY);
        assertThat(touched("referral-signal-retention")).isZero();
    }

    private UUID serviceRequest(User requester, String status, Duration updatedAgo) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into service_requests (id, requester_id, type, status, team, created_at, updated_at)"
                + " values (?, ?, 'rent-agreement', ?, 'rental', ?, ?)", id, requester.getId(), status,
                ago(updatedAgo), ago(updatedAgo));
        return id;
    }

    private UUID invite(UUID request, User invitedBy, String mobile, String role, int index, Instant expiresAt) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into service_request_parties (id, request_id, mobile, role, status, invited_by,"
                + " invite_expires_at, party_index) values (?, ?, ?, ?, 'invited', ?, ?, ?)", id, request, mobile, role,
                invitedBy.getId(), Timestamp.from(expiresAt), index);
        return id;
    }

    @Test
    @DisplayName("co-fill-invite-retention deletes only unclaimed invites past their expiry")
    void unclaimedInvitesExpire() {
        User owner = user("20", "buyer");
        User claimant = user("21", "buyer");
        UUID request = serviceRequest(owner, "new", Duration.ZERO);
        Instant now = Instant.now();
        UUID expired = invite(request, owner, "7791502001", "owner", 0, now.minus(MARGIN));
        UUID longExpired = invite(request, owner, "7791502002", "owner", 1, now.minus(Duration.ofDays(200)));
        UUID open = invite(request, owner, "7791502003", "tenant", 0, now.plus(MARGIN));
        UUID claimed = UUID.randomUUID();
        jdbc.update("insert into service_request_parties (id, request_id, user_id, role, status, invited_by,"
                + " party_index) values (?, ?, ?, 'tenant', 'accepted', ?, 1)", claimed, request, claimant.getId(),
                owner.getId());

        runGroup(Group.NIGHTLY);

        assertThat(exists("service_request_parties", "id", expired)).isFalse();
        assertThat(exists("service_request_parties", "id", longExpired)).isFalse();
        assertThat(exists("service_request_parties", "id", open)).isTrue();
        assertThat(exists("service_request_parties", "id", claimed)).isTrue();
        assertThat(exists("service_requests", "id", request)).isTrue();
        assertThat(touched("co-fill-invite-retention")).isEqualTo(2);

        runGroup(Group.NIGHTLY);
        assertThat(touched("co-fill-invite-retention")).isZero();
        assertThat(count("select count(*) from service_request_parties where request_id = ?", request)).isEqualTo(2);
    }

    private UUID partyIdentity(UUID request, String role, int index, Duration createdAgo, boolean alreadyPurged) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into service_request_identities (id, service_request_id, party_role, party_index,"
                + " party_name, pan, aadhaar, created_at, purged_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, request,
                role, index, "Asha " + role, alreadyPurged ? null : ID_SECRET, alreadyPurged ? null : ID_SECRET,
                ago(createdAgo), alreadyPurged ? ago(createdAgo) : null);
        return id;
    }

    private Map<String, Object> identityRow(UUID id) {
        return jdbc.queryForMap("select party_name, pan, aadhaar, purged_at from service_request_identities"
                + " where id = ?", id);
    }

    private long purgedEvents(UUID request) {
        return count("select count(*) from service_request_timeline where request_id = ? and event = 'identities.purged'",
                request);
    }

    @Test
    @DisplayName("service-request-identity-retention blanks numbers on idle (60d) and held (180d) open requests only")
    void identityNumbersPurgedOnIdleAndHeldWindows() {
        User owner = user("30", "buyer");
        Duration idle = Duration.ofDays(60);
        Duration held = Duration.ofDays(180);

        UUID idleDue = serviceRequest(owner, "in-progress", idle.plus(MARGIN));
        UUID idleDueRow = partyIdentity(idleDue, "owner", 0, idle.plus(MARGIN), false);

        UUID idleNotDue = serviceRequest(owner, "in-progress", idle.minus(MARGIN));
        UUID idleNotDueRow = partyIdentity(idleNotDue, "owner", 0, idle.minus(MARGIN), false);

        UUID siblingFresh = serviceRequest(owner, "assigned", idle.plus(Duration.ofDays(1)));
        UUID siblingOld = partyIdentity(siblingFresh, "owner", 0, Duration.ofDays(70), false);
        UUID siblingNew = partyIdentity(siblingFresh, "tenant", 0, Duration.ofDays(10), false);

        UUID heldDue = serviceRequest(owner, "draft-shared", Duration.ofDays(1));
        UUID heldDueRow = partyIdentity(heldDue, "owner", 0, held.plus(MARGIN), false);

        UUID heldNotDue = serviceRequest(owner, "draft-shared", Duration.ofDays(1));
        UUID heldNotDueRow = partyIdentity(heldNotDue, "owner", 0, held.minus(MARGIN), false);

        UUID completed = serviceRequest(owner, "completed", Duration.ofDays(400));
        UUID completedRow = partyIdentity(completed, "owner", 0, Duration.ofDays(400), false);
        UUID cancelled = serviceRequest(owner, "cancelled", Duration.ofDays(400));
        UUID cancelledRow = partyIdentity(cancelled, "owner", 0, Duration.ofDays(400), false);

        UUID mixed = serviceRequest(owner, "in-progress", Duration.ofDays(300));
        UUID mixedEarlier = partyIdentity(mixed, "owner", 0, Duration.ofDays(250), true);
        UUID mixedHeld = partyIdentity(mixed, "tenant", 0, Duration.ofDays(250), false);
        Timestamp earlierPurgedAt = (Timestamp) identityRow(mixedEarlier).get("purged_at");

        runGroup(Group.NIGHTLY);

        for (UUID purged : List.of(idleDueRow, heldDueRow, mixedHeld)) {
            Map<String, Object> row = identityRow(purged);
            assertThat(row.get("pan")).isNull();
            assertThat(row.get("aadhaar")).isNull();
            assertThat(row.get("purged_at")).isNotNull();
            assertThat(row.get("party_name")).isNotNull();
        }
        for (UUID kept : List.of(idleNotDueRow, siblingOld, siblingNew, heldNotDueRow, completedRow, cancelledRow)) {
            Map<String, Object> row = identityRow(kept);
            assertThat(row.get("pan")).isEqualTo(ID_SECRET);
            assertThat(row.get("aadhaar")).isEqualTo(ID_SECRET);
            assertThat(row.get("purged_at")).isNull();
        }
        assertThat(identityRow(mixedEarlier).get("purged_at")).isEqualTo(earlierPurgedAt);
        assertThat(purgedEvents(idleDue)).isEqualTo(1);
        assertThat(purgedEvents(heldDue)).isEqualTo(1);
        assertThat(purgedEvents(mixed)).isEqualTo(1);
        assertThat(purgedEvents(idleNotDue) + purgedEvents(siblingFresh) + purgedEvents(heldNotDue)
                + purgedEvents(completed) + purgedEvents(cancelled)).isZero();
        assertThat(touched("service-request-identity-retention")).isEqualTo(3);

        runGroup(Group.NIGHTLY);
        assertThat(touched("service-request-identity-retention")).isZero();
        assertThat(purgedEvents(idleDue) + purgedEvents(heldDue) + purgedEvents(mixed)).isEqualTo(3);
    }

    private UUID notification(User u, Duration age, boolean read) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into notifications (id, user_id, type, title, body, read, created_at)"
                + " values (?, ?, 'qa', 't', 'b', ?, ?)", id, u.getId(), read, ago(age));
        return id;
    }

    @Test
    @DisplayName("notification-retention deletes read and unread rows older than 90 days and keeps the rest")
    void notificationsExpireAfterNinetyDays() {
        User u = user("40", "buyer");
        Duration window = Duration.ofDays(90);
        UUID oldUnread = notification(u, window.plus(MARGIN), false);
        UUID oldRead = notification(u, window.plus(Duration.ofDays(200)), true);
        UUID justInsideUnread = notification(u, window.minus(MARGIN), false);
        UUID justInsideRead = notification(u, window.minus(MARGIN), true);
        UUID recent = notification(u, Duration.ZERO, false);

        runGroup(Group.NIGHTLY);

        assertThat(exists("notifications", "id", oldUnread)).isFalse();
        assertThat(exists("notifications", "id", oldRead)).isFalse();
        assertThat(exists("notifications", "id", justInsideUnread)).isTrue();
        assertThat(exists("notifications", "id", justInsideRead)).isTrue();
        assertThat(exists("notifications", "id", recent)).isTrue();
        assertThat(touched("notification-retention")).isEqualTo(2);

        runGroup(Group.NIGHTLY);
        assertThat(touched("notification-retention")).isZero();
    }

    private UUID pageView(Duration age) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into page_views (id, session_id, path, device, occurred_at) values (?, ?, '/x', 'mobile', ?)",
                id, TAG, ago(age));
        return id;
    }

    @Test
    @DisplayName("page-view-retention deletes raw views older than 30 days only")
    void pageViewsExpireAfterThirtyDays() {
        Duration window = Duration.ofDays(30);
        UUID old = pageView(window.plus(MARGIN));
        UUID veryOld = pageView(Duration.ofDays(300));
        UUID inside = pageView(window.minus(MARGIN));
        UUID recent = pageView(Duration.ZERO);

        runGroup(Group.NIGHTLY);

        assertThat(exists("page_views", "id", old)).isFalse();
        assertThat(exists("page_views", "id", veryOld)).isFalse();
        assertThat(exists("page_views", "id", inside)).isTrue();
        assertThat(exists("page_views", "id", recent)).isTrue();
        assertThat(touched("page-view-retention")).isEqualTo(2);

        runGroup(Group.NIGHTLY);
        assertThat(touched("page-view-retention")).isZero();
    }

    @Test
    @DisplayName("error-event-retention clears every row first seen over 30 days ago across several batches")
    void errorEventsExpireByFirstSeenInBatches() {
        jdbc.update("insert into error_event (id, fingerprint, source, first_seen, last_seen)"
                + " select gen_random_uuid(), 'qa-nightly-old-' || g, 'api', now() - interval '31 days', now()"
                + " from generate_series(1, 10001) g");
        jdbc.update("insert into error_event (id, fingerprint, source, first_seen, last_seen, resolved_at)"
                + " values (gen_random_uuid(), 'qa-nightly-resolved', 'web', ?, ?, now())", ago(Duration.ofDays(90)),
                ago(Duration.ofDays(89)));
        jdbc.update("insert into error_event (id, fingerprint, source, first_seen, last_seen)"
                + " values (gen_random_uuid(), 'qa-nightly-inside', 'job', ?, now())",
                ago(Duration.ofDays(30).minus(MARGIN)));
        jdbc.update("insert into error_event (id, fingerprint, source, first_seen, last_seen)"
                + " values (gen_random_uuid(), 'qa-nightly-new', 'api', now(), now())");

        runGroup(Group.NIGHTLY);

        assertThat(count("select count(*) from error_event where fingerprint like 'qa-nightly-%'")).isEqualTo(2);
        assertThat(count("select count(*) from error_event where fingerprint in ('qa-nightly-inside', 'qa-nightly-new')"))
                .isEqualTo(2);
        assertThat(touched("error-event-retention")).isEqualTo(10002);

        runGroup(Group.NIGHTLY);
        assertThat(touched("error-event-retention")).isZero();
    }

    private void audit(String action, Duration age) {
        jdbc.update("insert into audit_log (id, action, entity, entity_id, actor_role, at)"
                + " values (gen_random_uuid(), ?, ?, ?, 'admin', ?)", action, TAG, action, ago(age));
    }

    private boolean auditExists(String action) {
        return count("select count(*) from audit_log where entity = ? and entity_id = ?", TAG, action) > 0;
    }

    @Test
    @DisplayName("audit-log-retention purges year-old entries but keeps the actions code reads as state")
    void auditLogKeepsStateRowsAndPurgesTheRest() {
        Duration year = Duration.ofDays(365);
        List<String> state = List.of("property.status", "property.verification.decision",
                "service-request.party-declined", "serviceRequest.amountMismatch");
        state.forEach(action -> audit(action, year.plus(Duration.ofDays(400))));
        audit("qa.old", year.plus(MARGIN));
        audit("qa.inside", year.minus(MARGIN));
        audit("qa.recent", Duration.ZERO);
        jdbc.update("insert into audit_log (id, action, entity, entity_id, actor_role, at)"
                + " select gen_random_uuid(), 'qa.bulk', ?, 'qa.bulk', 'admin', now() - interval '400 days'"
                + " from generate_series(1, 5005)", TAG);

        runGroup(Group.NIGHTLY);

        state.forEach(action -> assertThat(auditExists(action)).as(action).isTrue());
        assertThat(auditExists("qa.old")).isFalse();
        assertThat(auditExists("qa.bulk")).isFalse();
        assertThat(auditExists("qa.inside")).isTrue();
        assertThat(auditExists("qa.recent")).isTrue();
        assertThat(touched("audit-log-retention")).isEqualTo(5006);

        runGroup(Group.NIGHTLY);
        assertThat(touched("audit-log-retention")).isZero();
    }

    private UUID providerCall(Duration age) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into provider_call (id, provider, operation, outcome, reference, created_at)"
                + " values (?, 'whatsapp', 'otp', 'ok', ?, ?)", id, TAG, ago(age));
        return id;
    }

    @Test
    @DisplayName("provider-call-retention deletes calls older than 30 days only")
    void providerCallsExpireAfterThirtyDays() {
        Duration window = Duration.ofDays(30);
        UUID old = providerCall(window.plus(MARGIN));
        UUID inside = providerCall(window.minus(MARGIN));
        UUID recent = providerCall(Duration.ZERO);

        runGroup(Group.NIGHTLY);

        assertThat(exists("provider_call", "id", old)).isFalse();
        assertThat(exists("provider_call", "id", inside)).isTrue();
        assertThat(exists("provider_call", "id", recent)).isTrue();
        assertThat(touched("provider-call-retention")).isEqualTo(1);

        runGroup(Group.NIGHTLY);
        assertThat(touched("provider-call-retention")).isZero();
    }

    private UUID verification(User u, String status, Duration decidedAgo, boolean alreadyPurged, User revoker) {
        UUID id = UUID.randomUUID();
        Timestamp decidedAt = decidedAgo == null ? null : ago(decidedAgo);
        jdbc.update("insert into identity_verifications (id, user_id, status, doc_type, consent_at, decided_at,"
                + " files_purged_at, claimed_name, claimed_number_last4, rejection_reason, revoked_at, revoked_by,"
                + " revocation_reason) values (?, ?, ?, 'pan', now(), ?, ?, 'Asha Patil', '1234', ?, ?, ?, ?)",
                id, u.getId(), status, decidedAt, alreadyPurged ? ago(Duration.ofDays(1)) : null,
                "rejected".equals(status) ? "blurry" : null,
                revoker == null ? null : ago(Duration.ofDays(8)), revoker == null ? null : revoker.getId(),
                revoker == null ? null : "fraudulent document seen");
        return id;
    }

    private String file(UUID verification, String kind, boolean stored) {
        String key = KEYS + verification + "/" + kind + ".png";
        if (stored) {
            storage.store(key, new byte[] {1, 2, 3}, "image/png");
        }
        insertFileRow(verification, kind, key);
        return key;
    }

    private void insertFileRow(UUID verification, String kind, String key) {
        jdbc.update("insert into identity_verification_files (id, verification_id, kind, storage_key, content_type,"
                + " size_bytes) values (gen_random_uuid(), ?, ?, ?, 'image/png', 3)", verification, kind, key);
    }

    private boolean filesPurged(UUID verification) {
        return jdbc.queryForObject("select files_purged_at is not null from identity_verifications where id = ?",
                Boolean.class, verification);
    }

    private long fileRows(UUID verification) {
        return count("select count(*) from identity_verification_files where verification_id = ?", verification);
    }

    @Test
    @DisplayName("identity-image-purge deletes stored images and file rows seven days after a decision")
    void identityImagesPurgedSevenDaysAfterDecision() {
        Duration window = Duration.ofDays(7);
        User staff = user("50", "admin");
        UUID verified = verification(user("51", "buyer"), "verified", window.plus(MARGIN), false, null);
        UUID rejected = verification(user("52", "buyer"), "rejected", window.plus(Duration.ofDays(60)), false, null);
        UUID revoked = verification(user("53", "buyer"), "revoked", window.plus(MARGIN), false, staff);
        UUID notDue = verification(user("54", "buyer"), "verified", window.minus(MARGIN), false, null);
        UUID pending = verification(user("55", "buyer"), "pending", null, false, null);
        UUID alreadyPurged = verification(user("56", "buyer"), "verified", window.plus(Duration.ofDays(3)), true, null);
        UUID storageDown = verification(user("57", "buyer"), "rejected", window.plus(MARGIN), false, null);

        List<String> dueKeys = List.of(file(verified, "front", true), file(verified, "selfie", true),
                file(rejected, "front", true), file(revoked, "selfie", true), file(storageDown, "front", true));
        List<String> keptKeys = List.of(file(notDue, "front", true), file(notDue, "selfie", true),
                file(pending, "front", true));
        String stuckKey = KEYS + storageDown + "/selfie.png.contenttype";
        insertFileRow(storageDown, "selfie", stuckKey);

        runGroup(Group.NIGHTLY);

        for (UUID due : List.of(verified, rejected, revoked, storageDown)) {
            assertThat(filesPurged(due)).as("files_purged_at %s", due).isTrue();
            assertThat(fileRows(due)).isZero();
        }
        dueKeys.forEach(key -> assertThat(onDisk(key)).as(key).isFalse());
        dueKeys.forEach(key -> assertThat(onDisk(key + ".contenttype")).as(key + " sidecar").isFalse());
        assertThat(count("select count(*) from identity_storage_deletes where storage_key like ?", KEYS + "%"))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("select attempts from identity_storage_deletes where storage_key = ?",
                Integer.class, stuckKey)).isEqualTo(1);

        assertThat(filesPurged(notDue)).isFalse();
        assertThat(filesPurged(pending)).isFalse();
        assertThat(fileRows(notDue)).isEqualTo(2);
        assertThat(fileRows(pending)).isEqualTo(1);
        keptKeys.forEach(key -> assertThat(onDisk(key)).as(key).isTrue());
        assertThat(filesPurged(alreadyPurged)).isTrue();
        assertThat(touched("identity-image-purge")).isEqualTo(4);

        runGroup(Group.NIGHTLY);
        assertThat(touched("identity-image-purge")).isZero();
        assertThat(count("select count(*) from identity_verification_files where storage_key like ?", KEYS + "%"))
                .isEqualTo(3);
    }

    @Test
    @DisplayName("identity-image-purge clears more due cases than one page holds in a single run")
    void identityImagePurgeDrainsSeveralPages() {
        jdbc.update("insert into users (id, mobile, role, mobile_verified) select gen_random_uuid(),"
                + " '" + BULK_MOBILES + "' || lpad(g::text, 3, '0'), 'buyer', true from generate_series(1, 450) g");
        jdbc.update("insert into identity_verifications (id, user_id, status, doc_type, consent_at, decided_at,"
                + " rejection_reason) select gen_random_uuid(), id, 'rejected', 'pan', now(),"
                + " now() - interval '8 days', 'blurry' from users where mobile like ?", BULK_MOBILES + "%");
        jdbc.update("insert into identity_verification_files (id, verification_id, kind, storage_key, content_type,"
                + " size_bytes) select gen_random_uuid(), v.id, 'front', ? || v.id || '/front.png', 'image/png', 3"
                + " from identity_verifications v join users u on u.id = v.user_id where u.mobile like ?", KEYS,
                BULK_MOBILES + "%");

        runGroup(Group.NIGHTLY);

        assertThat(count("select count(*) from identity_verifications v join users u on u.id = v.user_id"
                + " where u.mobile like ? and v.files_purged_at is null", BULK_MOBILES + "%")).isZero();
        assertThat(count("select count(*) from identity_verification_files where storage_key like ?", KEYS + "%"))
                .isZero();
        assertThat(count("select count(*) from identity_storage_deletes where storage_key like ?", KEYS + "%"))
                .isZero();
        assertThat(touched("identity-image-purge")).isEqualTo(450);
    }

    private void queuedDelete(String key, Duration queuedAgo, int attempts) {
        jdbc.update("insert into identity_storage_deletes (storage_key, queued_at, attempts) values (?, ?, ?)", key,
                ago(queuedAgo), attempts);
    }

    private String storedKey(String name) {
        String key = KEYS + name;
        storage.store(key, new byte[] {9}, "image/png");
        return key;
    }

    private boolean queued(String key) {
        return exists("identity_storage_deletes", "storage_key", key);
    }

    private int attempts(String key) {
        return jdbc.queryForObject("select attempts from identity_storage_deletes where storage_key = ?",
                Integer.class, key);
    }

    @Test
    @DisplayName("identity-delete-retry deletes due queued files, honours the backoff and keeps later ones")
    void queuedDeletesRunWhenDue() {
        String fresh = storedKey("fresh.png");
        String due = storedKey("due.png");
        String dueAfterManyTries = storedKey("many.png");
        String backedOff = storedKey("backed-off.png");
        String alreadyGone = KEYS + "already-gone.png";
        queuedDelete(fresh, Duration.ofMinutes(4), 0);
        queuedDelete(due, Duration.ofMinutes(6), 0);
        queuedDelete(dueAfterManyTries, Duration.ofHours(1), 5);
        queuedDelete(backedOff, Duration.ofHours(1), 20);
        queuedDelete(alreadyGone, Duration.ofDays(2), 3);

        runGroup(Group.NIGHTLY);

        for (String key : List.of(due, dueAfterManyTries, alreadyGone)) {
            assertThat(queued(key)).as("queued %s", key).isFalse();
            assertThat(onDisk(key)).as("on disk %s", key).isFalse();
        }
        for (String key : List.of(fresh, backedOff)) {
            assertThat(queued(key)).as("queued %s", key).isTrue();
            assertThat(onDisk(key)).as("on disk %s", key).isTrue();
        }
        assertThat(touched("identity-delete-retry")).isEqualTo(3);

        runGroup(Group.NIGHTLY);
        assertThat(touched("identity-delete-retry")).isZero();
        assertThat(attempts(fresh)).isZero();
        assertThat(attempts(backedOff)).isEqualTo(20);
    }

    @Test
    @DisplayName("identity-delete-retry tries a permanently failing delete once per run")
    void failingQueuedDeleteIsAttemptedOncePerRun() {
        String stuck = KEYS + "stuck.png.contenttype";
        queuedDelete(stuck, Duration.ofDays(2), 0);

        runGroup(Group.NIGHTLY);

        assertThat(attempts(stuck)).isEqualTo(1);
        assertThat(touched("identity-delete-retry")).isZero();
    }

    @Test
    @DisplayName("identity-delete-retry still deletes a healthy file queued behind 200 failing ones")
    void failingHeadOfQueueDoesNotStarveLaterDeletes() {
        jdbc.update("insert into identity_storage_deletes (storage_key, queued_at, attempts)"
                + " select ? || 'stuck-' || g || '.png.contenttype', now() - interval '3 days' + g * interval '1 second', 0"
                + " from generate_series(1, 200) g", KEYS);
        String healthy = storedKey("healthy.png");
        queuedDelete(healthy, Duration.ofDays(1), 0);

        runGroup(Group.NIGHTLY);

        assertThat(queued(healthy)).isFalse();
        assertThat(onDisk(healthy)).isFalse();
    }

    private UUID conflict(User u, Duration age) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into identity_conflicts (id, user_id, doc_type, claimed_hash, created_at)"
                + " values (?, ?, 'pan', 'hash', ?)", id, u.getId(), ago(age));
        return id;
    }

    @Test
    @DisplayName("identity-conflict-retention deletes conflict records older than 30 days only")
    void identityConflictsExpireAfterThirtyDays() {
        User u = user("60", "buyer");
        Duration window = Duration.ofDays(30);
        UUID old = conflict(u, window.plus(MARGIN));
        UUID veryOld = conflict(u, Duration.ofDays(400));
        UUID inside = conflict(u, window.minus(MARGIN));
        UUID recent = conflict(u, Duration.ZERO);

        runGroup(Group.NIGHTLY);

        assertThat(exists("identity_conflicts", "id", old)).isFalse();
        assertThat(exists("identity_conflicts", "id", veryOld)).isFalse();
        assertThat(exists("identity_conflicts", "id", inside)).isTrue();
        assertThat(exists("identity_conflicts", "id", recent)).isTrue();
        assertThat(touched("identity-conflict-retention")).isEqualTo(2);

        runGroup(Group.NIGHTLY);
        assertThat(touched("identity-conflict-retention")).isZero();
    }
}
