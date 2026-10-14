package com.draazy.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.billing.entitlement.EntitlementService;
import com.draazy.api.identity.user.User;
import com.draazy.api.jobs.ScheduledJob.Group;
import com.draazy.api.provider.FileStorage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

@DisplayName("DAYTIME trust jobs run against committed rows: identity expiry, contact returns, referral holds, needs-info")
class DaytimeTrustJobsQaTest extends AbstractJobQaTest {

    private static final String BULK_PREFIX = "6791503";
    private static final String KEY_SUFFIX = "-qa.jpg";
    private static final int FREE_CONTACTS = 15;

    @Autowired
    EntitlementService entitlements;
    @Autowired
    FileStorage storage;
    @Value("${draazy.storage.dir}")
    String storageDir;

    private int seq;
    private final List<String> storedKeys = new ArrayList<>();

    @Override
    protected String mobilePrefix() {
        return "97915030";
    }

    @AfterEach
    void removeRowsTheBasePurgeCannotReach() {
        String mine = "select id from users where mobile like '" + mobilePrefix() + "%' or mobile like '"
                + BULK_PREFIX + "%'";
        jdbc.update("update settings set value = value - 'referralRewards' where key = 'flags'");
        jdbc.update("delete from audit_log where entity = 'property' and entity_id in "
                + "(select id::text from properties where owner_id in (" + mine + "))");
        jdbc.update("delete from audit_log where entity = 'referral' and entity_id in "
                + "(select id::text from referrals where referrer_id in (" + mine + "))");
        jdbc.update("delete from audit_log where entity = 'identity_verification' and entity_id in "
                + "(select id::text from identity_verifications where user_id in (" + mine + "))");
        jdbc.update("delete from identity_verification_files where verification_id in "
                + "(select id from identity_verifications where user_id in (" + mine + "))");
        jdbc.update("delete from identity_verifications where user_id in (" + mine + ")");
        jdbc.update("delete from identity_storage_deletes where storage_key like ?", "%" + KEY_SUFFIX);
        jdbc.update("delete from notifications where user_id in (" + mine + ")");
        jdbc.update("delete from users where mobile like ?", BULK_PREFIX + "%");
        storedKeys.forEach(storage::delete);
        storedKeys.clear();
    }

    @Test
    @DisplayName("an unanswered contact request returns the contact and tells the seeker once; fresh and decided ones stay")
    void contactReturnsExpiresOnlyOverdueRequests() {
        User owner = user("01", "owner");
        UUID flat = listing(owner, "approved");
        User overdue = user("02", "buyer");
        User justOver = user("03", "buyer");
        User justInside = user("04", "buyer");
        User fresh = user("05", "buyer");
        User approved = user("06", "buyer");
        User declined = user("07", "buyer");
        User expired = user("08", "buyer");
        contact(overdue, flat, "pending", Duration.ofDays(8));
        contact(justOver, flat, "pending", Duration.ofDays(7).plusMinutes(2));
        contact(justInside, flat, "pending", Duration.ofDays(7).minusMinutes(2));
        contact(fresh, flat, "pending", Duration.ofDays(1));
        contact(approved, flat, "approved", Duration.ofDays(20));
        contact(declined, flat, "declined", Duration.ofDays(30));
        contact(expired, flat, "expired", Duration.ofDays(30));

        runGroup(Group.DAYTIME);

        assertThat(touched("contact-returns")).isEqualTo(2);
        assertThat(contactStatus(overdue, flat)).isEqualTo("expired");
        assertThat(contactStatus(justOver, flat)).isEqualTo("expired");
        assertThat(contactStatus(justInside, flat)).isEqualTo("pending");
        assertThat(contactStatus(fresh, flat)).isEqualTo("pending");
        assertThat(contactStatus(approved, flat)).isEqualTo("approved");
        assertThat(contactStatus(declined, flat)).isEqualTo("declined");
        assertThat(contactStatus(expired, flat)).isEqualTo("expired");
        for (User seeker : List.of(overdue, justOver)) {
            assertThat(notes(seeker, "contact.returned")).isEqualTo(1);
            assertThat(remaining(seeker)).isEqualTo(FREE_CONTACTS);
        }
        List<Map<String, Object>> note = jdbc.queryForList(
                "select title, body, link from notifications where user_id = ? and type = 'contact.returned'",
                overdue.getId());
        assertThat(note).singleElement().satisfies(row -> {
            assertThat((String) row.get("body")).contains("didn't reply").contains("QA flat");
            assertThat(row.get("link")).isEqualTo("/property/" + flat);
        });
        for (User untouched : List.of(justInside, fresh, approved, declined, expired)) {
            assertThat(notes(untouched, "contact.returned")).isZero();
        }
        assertThat(remaining(justInside)).isEqualTo(FREE_CONTACTS - 1);
        assertThat(remaining(fresh)).isEqualTo(FREE_CONTACTS - 1);
        assertThat(remaining(approved)).isEqualTo(FREE_CONTACTS - 1);
        assertThat(remaining(declined)).isEqualTo(FREE_CONTACTS);
        assertThat(remaining(expired)).isEqualTo(FREE_CONTACTS);
        assertThat(notes(owner, "contact.returned")).isZero();

        runGroup(Group.DAYTIME);

        assertThat(touched("contact-returns")).isZero();
        assertThat(notes(overdue, "contact.returned")).isEqualTo(1);
        assertThat(notes(justOver, "contact.returned")).isEqualTo(1);
    }

    @Test
    @DisplayName("one daily run expires more than one page of overdue contact requests")
    void contactReturnsClearsMoreThanOneBatchInOneRun() {
        User owner = user("01", "owner");
        User seeker = user("02", "buyer");
        jdbc.update("""
                insert into properties (owner_id, title, deal, property_type, price, locality, status)
                select ?, 'QA bulk ' || i, 'rent', 'apartment', 20000, 'Kothrud', 'approved'
                  from generate_series(1, 520) i
                """, owner.getId());
        jdbc.update("""
                insert into contact_requests (property_id, requester_id, status, created_at, first_requested_at, enquired_at)
                select id, ?, 'pending', now() - interval '9 days', now() - interval '9 days', now() - interval '9 days'
                  from properties where owner_id = ?
                """, seeker.getId(), owner.getId());

        runGroup(Group.DAYTIME);

        assertThat(jdbc.queryForObject("select count(*) from contact_requests where requester_id = ? and status = 'pending'",
                Long.class, seeker.getId())).isZero();
        assertThat(notes(seeker, "contact.returned")).isEqualTo(520);
    }

    @Test
    @DisplayName("held referrals are released or rejected on the evidence, with credit, notices and audit exactly once")
    void referralHoldsDecideEachDueHeldRowOnce() {
        User thirdOwner = user("10", "owner");
        UUID thirdListing = listing(thirdOwner, "approved");

        User releasedSeeker = user("11", "buyer");
        User releasedFriend = user("12", "buyer");
        UUID released = referral(releasedSeeker, releasedFriend.getMobile(), "held", "seeker",
                Instant.now().minusSeconds(5), null, thirdListing, null);

        User suspendedReferrer = user("13", "buyer");
        User suspendedFriend = user("14", "buyer");
        jdbc.update("update users set status = 'suspended' where id = ?", suspendedFriend.getId());
        UUID suspended = referral(suspendedReferrer, suspendedFriend.getMobile(), "held", "seeker",
                Instant.now().minus(Duration.ofHours(30)), null, thirdListing, null);

        User ownerReferrer = user("15", "owner");
        UUID verified = listing(ownerReferrer, "approved");
        jdbc.update("update properties set ownership_verified_at = now(), featured_days = 14 where id = ?", verified);
        UUID ownerOk = referral(ownerReferrer, offMobile(1), "held", "owner",
                Instant.now().minus(Duration.ofHours(1)), null, verified, null);

        User fakeReferrer = user("17", "owner");
        UUID fake = listing(fakeReferrer, "rejected");
        jdbc.update("update properties set ownership_verified_at = now(), featured_days = 14 where id = ?", fake);
        UUID ownerFake = referral(fakeReferrer, offMobile(2), "held", "owner",
                Instant.now().minus(Duration.ofHours(1)), null, fake, null);

        User unverifiedReferrer = user("19", "owner");
        UUID unverified = listing(unverifiedReferrer, "approved");
        jdbc.update("update properties set featured_days = 14 where id = ?", unverified);
        UUID ownerUnverified = referral(unverifiedReferrer, offMobile(3), "held", "owner",
                Instant.now().minus(Duration.ofHours(1)), null, unverified, null);

        User selfDealer = user("21", "owner");
        UUID ownListing = listing(selfDealer, "approved");
        UUID selfDealing = referral(selfDealer, offMobile(4), "held", "seeker",
                Instant.now().minus(Duration.ofHours(1)), null, ownListing, null);

        User waitingReferrer = user("23", "buyer");
        Instant stillHeldUntil = Instant.now().plus(Duration.ofMinutes(5)).truncatedTo(ChronoUnit.SECONDS);
        UUID notDue = referral(waitingReferrer, offMobile(5), "held", "seeker", stillHeldUntil, null, thirdListing, null);

        User pendingReferrer = user("24", "buyer");
        UUID pending = referral(pendingReferrer, offMobile(6), "pending", "seeker",
                Instant.now().minus(Duration.ofDays(3)), null, null, null);
        User rejectedReferrer = user("25", "buyer");
        UUID rejected = referral(rejectedReferrer, offMobile(7), "rejected", "seeker",
                Instant.now().minus(Duration.ofDays(3)), null, null, "system");

        User clawReferrer = user("26", "buyer");
        User clawFriend = user("27", "buyer");
        jdbc.update("update users set status = 'suspended' where id = ?", clawFriend.getId());
        UUID clawback = referral(clawReferrer, clawFriend.getMobile(), "qualified", "seeker", null,
                Instant.now().minus(Duration.ofDays(5)), thirdListing, "system");
        User oldReferrer = user("28", "buyer");
        User oldFriend = user("29", "buyer");
        jdbc.update("update users set status = 'suspended' where id = ?", oldFriend.getId());
        UUID outsideWindow = referral(oldReferrer, oldFriend.getMobile(), "qualified", "seeker", null,
                Instant.now().minus(Duration.ofDays(40)), thirdListing, "system");
        User staffReferrer = user("30", "buyer");
        User staffFriend = user("31", "buyer");
        jdbc.update("update users set status = 'suspended' where id = ?", staffFriend.getId());
        UUID staffForced = referral(staffReferrer, staffFriend.getMobile(), "rewarded", "seeker", null,
                Instant.now().minus(Duration.ofDays(5)), thirdListing, "staff");
        User healthyReferrer = user("32", "buyer");
        User healthyFriend = user("33", "buyer");
        UUID healthy = referral(healthyReferrer, healthyFriend.getMobile(), "qualified", "seeker", null,
                Instant.now().minus(Duration.ofDays(5)), thirdListing, "system");

        int seekerBefore = remaining(releasedSeeker);
        int friendBefore = remaining(releasedFriend);
        int suspendedFriendBefore = remaining(suspendedFriend);
        assertThat(friendBefore).isEqualTo(FREE_CONTACTS + 5);
        assertThat(suspendedFriendBefore).isEqualTo(FREE_CONTACTS + 5);

        runGroup(Group.DAYTIME);

        assertThat(touched("referral-holds")).isEqualTo(6);
        assertThat(referralRow(released)).containsEntry("status", "qualified").containsEntry("handled_by", "system")
                .containsEntry("hold_until", null).containsEntry("auto_reason", null);
        assertThat(referralRow(released).get("granted_at")).isNotNull();
        assertThat(remaining(releasedSeeker)).isEqualTo(seekerBefore + 15);
        assertThat(remaining(releasedFriend)).isEqualTo(friendBefore);
        assertThat(notes(releasedSeeker, "referral.outcome")).isZero();
        assertThat(audits("referral.auto.released", released)).isEqualTo(1);

        assertThat(referralRow(suspended)).containsEntry("status", "rejected")
                .containsEntry("auto_reason", "referee_suspended").containsEntry("hold_until", null);
        assertThat(notes(suspendedReferrer, "referral.outcome")).isEqualTo(1);
        assertThat(remaining(suspendedReferrer)).isEqualTo(FREE_CONTACTS);
        assertThat(remaining(suspendedFriend)).isEqualTo(FREE_CONTACTS);
        assertThat(audits("referral.auto.rejected", suspended)).isEqualTo(1);

        assertThat(referralRow(ownerOk)).containsEntry("status", "qualified");
        assertThat(featuredDays(verified)).isEqualTo(14);
        assertThat(notes(ownerReferrer, "referral.outcome")).isZero();

        assertThat(referralRow(ownerFake)).containsEntry("status", "rejected")
                .containsEntry("auto_reason", "listing_taken_down");
        assertThat(featuredDays(fake)).isNull();
        assertThat(referralRow(ownerUnverified)).containsEntry("status", "rejected")
                .containsEntry("auto_reason", "verification_revoked");
        assertThat(featuredDays(unverified)).isNull();
        assertThat(referralRow(selfDealing)).containsEntry("status", "rejected")
                .containsEntry("auto_reason", "self_dealing");
        for (User referrer : List.of(fakeReferrer, unverifiedReferrer, selfDealer)) {
            assertThat(notes(referrer, "referral.outcome")).isEqualTo(1);
        }

        assertThat(referralRow(notDue)).containsEntry("status", "held");
        assertThat(((Timestamp) referralRow(notDue).get("hold_until")).toInstant()).isEqualTo(stillHeldUntil);
        assertThat(referralRow(pending)).containsEntry("status", "pending");
        assertThat(referralRow(rejected)).containsEntry("status", "rejected");
        assertThat(notes(waitingReferrer, "referral.outcome")).isZero();
        assertThat(notes(pendingReferrer, "referral.outcome")).isZero();
        assertThat(notes(rejectedReferrer, "referral.outcome")).isZero();

        assertThat(referralRow(clawback)).containsEntry("status", "clawed-back").containsEntry("auto_reason", "referee_suspended");
        assertThat(notes(clawReferrer, "referral.outcome")).isEqualTo(1);
        assertThat(referralRow(outsideWindow)).containsEntry("status", "qualified");
        assertThat(referralRow(staffForced)).containsEntry("status", "rewarded").containsEntry("handled_by", "staff");
        assertThat(referralRow(healthy)).containsEntry("status", "qualified");
        for (User quiet : List.of(oldReferrer, staffReferrer, healthyReferrer)) {
            assertThat(notes(quiet, "referral.outcome")).isZero();
        }

        runGroup(Group.DAYTIME);

        assertThat(touched("referral-holds")).isZero();
        assertThat(notes(suspendedReferrer, "referral.outcome")).isEqualTo(1);
        assertThat(notes(clawReferrer, "referral.outcome")).isEqualTo(1);
        assertThat(audits("referral.auto.released", released)).isEqualTo(1);
        assertThat(audits("referral.auto.clawback", clawback)).isEqualTo(1);
        assertThat(referralRow(notDue)).containsEntry("status", "held");
    }

    @Test
    @DisplayName("one daily run releases more than one page of due held referrals, each exactly once")
    void referralHoldsDrainsMoreThanOnePage() {
        User referrer = user("40", "buyer");
        jdbc.update("""
                insert into referrals (referrer_id, referrer_mobile, referred, referred_mobile, channel, status, track,
                                       risk, hold_until, qualified_at)
                select ?, ?, 'Friend', '79150' || lpad(i::text, 5, '0'), 'seeker', 'held', 'seeker', 'medium',
                       now() - interval '1 hour', now() - interval '8 days'
                  from generate_series(1, 520) i
                """, referrer.getId(), referrer.getMobile());

        runGroup(Group.DAYTIME);

        assertThat(touched("referral-holds")).isEqualTo(520);
        assertThat(jdbc.queryForObject("select count(*) from referrals where referrer_id = ? and status = 'qualified'",
                Long.class, referrer.getId())).isEqualTo(520);
        assertThat(jdbc.queryForObject("""
                select count(*) from audit_log where action = 'referral.auto.released' and entity_id in
                       (select id::text from referrals where referrer_id = ?)
                """, Long.class, referrer.getId())).isEqualTo(520);
    }

    @Test
    @DisplayName("granted referrals past the first 500 in the clawback window are still re-checked")
    void referralRecheckCoversEveryGrantedReferralInTheWindow() {
        User referrer = user("41", "buyer");
        jdbc.update("""
                insert into referrals (referrer_id, referrer_mobile, referred, referred_mobile, channel, status, track,
                                       risk, qualified_at, granted_at, handled_by)
                select ?, ?, 'Friend', '79150' || lpad(i::text, 5, '0'), 'seeker', 'qualified', 'seeker', 'low',
                       now() - interval '10 days', now() - interval '10 days' + i * interval '1 second', 'system'
                  from generate_series(1, 520) i
                """, referrer.getId(), referrer.getMobile());
        User friend = user("42", "buyer");
        jdbc.update("update users set status = 'suspended' where id = ?", friend.getId());
        jdbc.update("update referrals set referred_mobile = ? where referrer_id = ? and referred_mobile = ?",
                friend.getMobile(), referrer.getId(), "7915000520");

        runGroup(Group.DAYTIME);

        assertThat(jdbc.queryForObject("select status from referrals where referred_mobile = ?", String.class,
                friend.getMobile())).isEqualTo("clawed-back");
    }

    @Test
    @DisplayName("with referral rewards switched off the sweep reports nothing touched and leaves holds as they are")
    void referralHoldsReportNothingWhenRewardsAreOff() {
        User referrer = user("43", "buyer");
        UUID held = referral(referrer, offMobile(8), "held", "seeker", Instant.now().minus(Duration.ofHours(2)), null,
                null, null);
        jdbc.update("update settings set value = value || '{\"referralRewards\": false}'::jsonb where key = 'flags'");

        runGroup(Group.DAYTIME);

        assertThat(referralRow(held)).containsEntry("status", "held");
        assertThat(touched("referral-holds")).isZero();
    }

    @Test
    @DisplayName("needs-info reminds at 3 and 7 days once each, archives at 14, and ignores every other row")
    void needsInfoFollowsTheScheduleOnRealRows() {
        User first = user("50", "owner");
        User notYet = user("51", "owner");
        User seven = user("52", "owner");
        User afterFirst = user("53", "owner");
        User nearlyFourteen = user("54", "owner");
        User archive = user("55", "owner");
        User done = user("56", "owner");
        User rearmed = user("57", "owner");
        User rearmedSeven = user("58", "owner");
        User alreadyArchived = user("59", "owner");
        User approvedListing = user("60", "owner");
        User reviewPending = user("61", "owner");
        User noRequest = user("62", "owner");
        UUID firstId = needsInfo(first, Duration.ofDays(3).plusMinutes(2));
        UUID notYetId = needsInfo(notYet, Duration.ofDays(3).minusMinutes(2));
        UUID sevenId = needsInfo(seven, Duration.ofDays(7).plusMinutes(2));
        UUID afterFirstId = needsInfo(afterFirst, Duration.ofDays(8));
        reminded(afterFirstId, Duration.ofDays(5), null);
        UUID nearlyId = needsInfo(nearlyFourteen, Duration.ofDays(14).minusMinutes(2));
        UUID archiveId = needsInfo(archive, Duration.ofDays(14).plusMinutes(2));
        UUID doneId = needsInfo(done, Duration.ofDays(13));
        reminded(doneId, Duration.ofDays(9), Duration.ofDays(6));
        UUID rearmedId = needsInfo(rearmed, Duration.ofDays(4));
        reminded(rearmedId, Duration.ofDays(20), Duration.ofDays(18));
        UUID rearmedSevenId = needsInfo(rearmedSeven, Duration.ofDays(8));
        reminded(rearmedSevenId, Duration.ofDays(30), Duration.ofDays(25));
        UUID archivedId = needsInfo(alreadyArchived, Duration.ofDays(20));
        jdbc.update("update properties set archived = true where id = ?", archivedId);
        UUID approvedId = needsInfo(approvedListing, Duration.ofDays(20));
        jdbc.update("update properties set status = 'approved' where id = ?", approvedId);
        UUID pendingReviewId = needsInfo(reviewPending, Duration.ofDays(20));
        jdbc.update("update property_reviews set status = 'pending' where property_id = ?", pendingReviewId);
        UUID noRequestId = needsInfo(noRequest, Duration.ofDays(20));
        jdbc.update("update properties set info_requested_at = null where id = ?", noRequestId);

        runGroup(Group.DAYTIME);

        assertThat(touched("needs-info")).isEqualTo(7);
        for (User due : List.of(first, seven, afterFirst, nearlyFourteen, rearmed, rearmedSeven)) {
            assertThat(reminders(due)).as("reminders for %s", due.getMobile()).isEqualTo(1);
            assertThat(notes(due, "listing.needs_info_timeout")).isZero();
        }
        assertThat(reviewRow(firstId).get("needs_info_day2_reminded_at")).isNotNull();
        assertThat(reviewRow(firstId).get("needs_info_day7_reminded_at")).isNull();
        assertThat(reviewRow(sevenId).get("needs_info_day2_reminded_at")).isNotNull();
        assertThat(reviewRow(sevenId).get("needs_info_day7_reminded_at")).isNotNull();
        assertThat(((Timestamp) reviewRow(rearmedId).get("needs_info_day2_reminded_at")).toInstant())
                .isAfter(Instant.now().minus(Duration.ofMinutes(5)));
        assertThat(((Timestamp) reviewRow(rearmedSevenId).get("needs_info_day7_reminded_at")).toInstant())
                .isAfter(Instant.now().minus(Duration.ofMinutes(5)));
        assertThat(isArchived(nearlyId)).isFalse();
        assertThat(reminders(notYet)).isZero();
        assertThat(reminders(done)).isZero();
        assertThat(reminders(alreadyArchived) + reminders(approvedListing) + reminders(reviewPending)
                + reminders(noRequest)).isZero();

        assertThat(isArchived(archiveId)).isTrue();
        assertThat(jdbc.queryForObject("select archive_reason from properties where id = ?", String.class, archiveId))
                .isEqualTo("needs_info_timeout");
        assertThat(reviewRow(archiveId).get("needs_info_timeout_archived_at")).isNotNull();
        assertThat(notes(archive, "listing.needs_info_timeout")).isEqualTo(1);
        assertThat(reminders(archive)).isZero();
        assertThat(audits("property.needs_info.timeout_archive", archiveId)).isEqualTo(1);
        for (UUID untouched : List.of(notYetId, doneId, approvedId, pendingReviewId, noRequestId)) {
            assertThat(isArchived(untouched)).isFalse();
        }
        for (User quiet : List.of(notYet, done, alreadyArchived, approvedListing, reviewPending, noRequest)) {
            assertThat(notes(quiet, "listing.needs_info_timeout")).isZero();
        }

        runGroup(Group.DAYTIME);

        assertThat(touched("needs-info")).isZero();
        for (User due : List.of(first, seven, afterFirst, nearlyFourteen, rearmed, rearmedSeven)) {
            assertThat(reminders(due)).isEqualTo(1);
        }
        assertThat(notes(archive, "listing.needs_info_timeout")).isEqualTo(1);
        assertThat(audits("property.needs_info.timeout_archive", archiveId)).isEqualTo(1);
    }

    @Test
    @DisplayName("needs-info clears more than one page in one run without reminding any owner twice for a listing")
    void needsInfoDrainDoesNotRepeatReminders() {
        User a = user("70", "owner");
        User b = user("71", "owner");
        User c = user("72", "owner");
        int[] sizes = {100, 90, 60};
        List<User> owners = List.of(a, b, c);
        for (int i = 0; i < owners.size(); i++) {
            jdbc.update("""
                    insert into properties (owner_id, title, deal, property_type, price, locality, status, info_requested_at)
                    select ?, 'QA needs ' || i, 'rent', 'apartment', 20000, 'Kothrud', 'pending', now() - interval '4 days'
                      from generate_series(1, ?) i
                    """, owners.get(i).getId(), sizes[i]);
        }
        jdbc.update("""
                insert into property_reviews (property_id, status, last_message_at)
                select id, 'needs_info', now() from properties
                 where info_requested_at is not null and owner_id in (?, ?, ?)
                """, a.getId(), b.getId(), c.getId());

        runGroup(Group.DAYTIME);

        assertThat(touched("needs-info")).isEqualTo(250);
        for (int i = 0; i < owners.size(); i++) {
            assertThat(reminders(owners.get(i))).isEqualTo(sizes[i]);
        }
        assertThat(jdbc.queryForObject("""
                select count(*) from property_reviews r join properties p on p.id = r.property_id
                 where p.owner_id in (?, ?, ?) and r.needs_info_day2_reminded_at is null
                """, Long.class, a.getId(), b.getId(), c.getId())).isZero();

        runGroup(Group.DAYTIME);

        assertThat(touched("needs-info")).isZero();
        assertThat(reminders(a) + reminders(b) + reminders(c)).isEqualTo(250);
    }

    @Test
    @DisplayName("a pending identity review older than 14 days is rejected, informed, purged and audited once")
    void identityPendingExpiryHandlesEachCase() throws Exception {
        User reviewer = user("80", "admin");
        User stale = user("81", "buyer");
        User staleClaim = user("82", "buyer");
        User freshClaim = user("83", "buyer");
        User justInside = user("84", "buyer");
        User justOutside = user("85", "buyer");
        User verified = user("86", "buyer");
        User rejected = user("87", "buyer");
        User withdrawn = user("88", "buyer");
        UUID staleId = identity(stale, "pending", Duration.ofDays(15), true);
        UUID staleClaimId = identity(staleClaim, "pending", Duration.ofDays(20), true);
        jdbc.update("update identity_verifications set claimed_by = ?, claimed_at = ? where id = ?",
                reviewer.getId(), ts(Duration.ofMinutes(40)), staleClaimId);
        UUID freshClaimId = identity(freshClaim, "pending", Duration.ofDays(20), true);
        jdbc.update("update identity_verifications set claimed_by = ?, claimed_at = ? where id = ?",
                reviewer.getId(), ts(Duration.ofMinutes(5)), freshClaimId);
        UUID insideId = identity(justInside, "pending", Duration.ofDays(14).minusMinutes(2), true);
        UUID outsideId = identity(justOutside, "pending", Duration.ofDays(14).plusMinutes(2), false);
        UUID verifiedId = identity(verified, "verified", Duration.ofDays(20), true);
        UUID rejectedId = identity(rejected, "rejected", Duration.ofDays(20), true);
        UUID withdrawnId = identity(withdrawn, "withdrawn", Duration.ofDays(20), true);
        List<String> staleKeys = fileKeys(staleId);

        runGroup(Group.DAYTIME);

        assertThat(touched("identity-pending-expiry")).isEqualTo(3);
        for (UUID id : List.of(staleId, staleClaimId, outsideId)) {
            Map<String, Object> row = identityRow(id);
            assertThat(row).containsEntry("status", "rejected").containsEntry("rejection_reason", "not_reviewed")
                    .containsEntry("attempt_count", 0).containsEntry("reviewer_id", null);
            assertThat((String) row.get("rejection_note")).startsWith("We couldn't review this in time");
            assertThat(((Timestamp) row.get("decided_at")).toInstant()).isAfter(Instant.now().minusSeconds(120));
            assertThat(((Timestamp) row.get("attempt_window_start")).toInstant())
                    .isAfter(Instant.now().minusSeconds(120));
            assertThat(row.get("files_purged_at")).isNotNull();
            assertThat(fileRows(id)).isZero();
            assertThat(audits("identity.verification.expired", id)).isEqualTo(1);
        }
        assertThat(staleKeys).hasSize(3).allSatisfy(key -> assertThat(Files.exists(storagePath(key))).isFalse());
        assertThat(jdbc.queryForObject("select count(*) from identity_storage_deletes where storage_key like ?",
                Long.class, "%" + KEY_SUFFIX)).isZero();
        for (User expired : List.of(stale, staleClaim, justOutside)) {
            assertThat(notes(expired, "identity.rejected")).isEqualTo(1);
        }
        List<Map<String, Object>> note = jdbc.queryForList(
                "select title, body, link from notifications where user_id = ? and type = 'identity.rejected'",
                stale.getId());
        assertThat(note).singleElement().satisfies(row -> {
            assertThat(row.get("title")).isEqualTo("Verification needs another try");
            assertThat((String) row.get("body")).contains("couldn't review this in time");
            assertThat(row.get("link")).isEqualTo("/verify-identity");
        });
        for (UUID id : List.of(freshClaimId, insideId)) {
            assertThat(identityRow(id)).containsEntry("status", "pending");
            assertThat(fileRows(id)).isEqualTo(3);
            assertThat(fileKeys(id)).allSatisfy(key -> assertThat(Files.exists(storagePath(key))).isTrue());
        }
        assertThat(identityRow(verifiedId)).containsEntry("status", "verified");
        assertThat(identityRow(rejectedId)).containsEntry("status", "rejected").containsEntry("rejection_reason", null);
        assertThat(identityRow(withdrawnId)).containsEntry("status", "withdrawn");
        for (User ignored : List.of(freshClaim, justInside, verified, rejected, withdrawn)) {
            assertThat(notes(ignored, "identity.rejected")).isZero();
        }

        runGroup(Group.DAYTIME);

        assertThat(touched("identity-pending-expiry")).isZero();
        for (User expired : List.of(stale, staleClaim, justOutside)) {
            assertThat(notes(expired, "identity.rejected")).isEqualTo(1);
        }
        assertThat(audits("identity.verification.expired", staleId)).isEqualTo(1);
    }

    @Test
    @DisplayName("one daily run expires more than one page of stale identity reviews, informing each user once")
    void identityPendingExpiryDrainsMoreThanOnePage() {
        jdbc.update("insert into users (mobile, role) select ? || lpad(i::text, 3, '0'), 'buyer' "
                + "from generate_series(1, 250) i", BULK_PREFIX);
        jdbc.update("""
                insert into identity_verifications (user_id, status, doc_type, consent_at, submitted_at)
                select id, 'pending', 'aadhaar', now() - interval '20 days', now() - interval '20 days'
                  from users where mobile like ?
                """, BULK_PREFIX + "%");

        runGroup(Group.DAYTIME);

        assertThat(touched("identity-pending-expiry")).isEqualTo(250);
        assertThat(jdbc.queryForObject("""
                select count(*) from identity_verifications v join users u on u.id = v.user_id
                 where u.mobile like ? and v.status = 'rejected'
                """, Long.class, BULK_PREFIX + "%")).isEqualTo(250);
        assertThat(jdbc.queryForObject("""
                select count(*) from notifications n join users u on u.id = n.user_id
                 where u.mobile like ? and n.type = 'identity.rejected'
                """, Long.class, BULK_PREFIX + "%")).isEqualTo(250);
        assertThat(jdbc.queryForObject("""
                select count(distinct n.user_id) from notifications n join users u on u.id = n.user_id
                 where u.mobile like ? and n.type = 'identity.rejected'
                """, Long.class, BULK_PREFIX + "%")).isEqualTo(250);
    }

    private String offMobile(int n) {
        return "7791503" + String.format("%03d", n);
    }

    private Timestamp ts(Duration age) {
        return Timestamp.from(Instant.now().minus(age));
    }

    private Timestamp ts(Instant at) {
        return at == null ? null : Timestamp.from(at);
    }

    private UUID listing(User owner, String status) {
        return jdbc.queryForObject("""
                insert into properties (owner_id, title, deal, property_type, price, locality, status)
                values (?, ?, 'rent', 'apartment', 25000, 'Kothrud', ?) returning id
                """, UUID.class, owner.getId(), "QA flat " + (++seq), status);
    }

    private void contact(User requester, UUID property, String status, Duration age) {
        jdbc.update("""
                insert into contact_requests (property_id, requester_id, status, created_at, first_requested_at, enquired_at)
                values (?, ?, ?, ?, ?, ?)
                """, property, requester.getId(), status, ts(age), ts(age), ts(age));
    }

    private String contactStatus(User requester, UUID property) {
        return jdbc.queryForObject("select status from contact_requests where requester_id = ? and property_id = ?",
                String.class, requester.getId(), property);
    }

    private int remaining(User user) {
        return entitlements.contactsRemaining(user.getId()).getAsInt();
    }

    private long notes(User user, String type) {
        return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?", Long.class,
                user.getId(), type);
    }

    private long reminders(User owner) {
        return notes(owner, "listing.needs_info_reminder");
    }

    private long audits(String action, UUID entityId) {
        return jdbc.queryForObject("select count(*) from audit_log where action = ? and entity_id = ?", Long.class,
                action, entityId.toString());
    }

    private UUID referral(User referrer, String refereeMobile, String status, String track, Instant holdUntil,
            Instant grantedAt, UUID property, String handledBy) {
        return jdbc.queryForObject("""
                insert into referrals (referrer_id, referrer_mobile, referred, referred_mobile, channel, status, track,
                                       risk, hold_until, granted_at, qualified_at, qualified_property_id, handled_by)
                values (?, ?, 'Friend', ?, 'seeker', ?, ?, 'medium', ?, ?, now() - interval '8 days', ?, ?) returning id
                """, UUID.class, referrer.getId(), referrer.getMobile(), refereeMobile, status, track,
                ts(holdUntil), ts(grantedAt), property, handledBy);
    }

    private Map<String, Object> referralRow(UUID id) {
        return jdbc.queryForMap("select * from referrals where id = ?", id);
    }

    private Integer featuredDays(UUID property) {
        return jdbc.queryForObject("select featured_days from properties where id = ?", Integer.class, property);
    }

    private UUID needsInfo(User owner, Duration age) {
        UUID property = listing(owner, "pending");
        jdbc.update("update properties set info_requested_at = ? where id = ?", ts(age), property);
        jdbc.update("insert into property_reviews (property_id, status, last_message_at) values (?, 'needs_info', now())",
                property);
        return property;
    }

    private void reminded(UUID property, Duration day2Ago, Duration day7Ago) {
        jdbc.update("update property_reviews set needs_info_day2_reminded_at = ?, needs_info_day7_reminded_at = ? "
                + "where property_id = ?", ts(day2Ago), day7Ago == null ? null : ts(day7Ago), property);
    }

    private Map<String, Object> reviewRow(UUID property) {
        return jdbc.queryForMap("select * from property_reviews where property_id = ?", property);
    }

    private boolean isArchived(UUID property) {
        return jdbc.queryForObject("select archived from properties where id = ?", Boolean.class, property);
    }

    private UUID identity(User subject, String status, Duration submittedAgo, boolean withFiles) {
        UUID id = jdbc.queryForObject("""
                insert into identity_verifications (user_id, status, doc_type, consent_at, submitted_at, attempt_count)
                values (?, ?, 'pan', ?, ?, 2) returning id
                """, UUID.class, subject.getId(), status, ts(submittedAgo), ts(submittedAgo));
        if (!withFiles) {
            return id;
        }
        for (String kind : List.of("front", "back", "selfie")) {
            String key = "identity/" + subject.getId() + "/" + id + "/" + kind + KEY_SUFFIX;
            storage.store(key, new byte[] {1, 2, 3}, "image/jpeg");
            storedKeys.add(key);
            jdbc.update("""
                    insert into identity_verification_files (verification_id, kind, storage_key, content_type, size_bytes)
                    values (?, ?, ?, 'image/jpeg', 3)
                    """, id, kind, key);
        }
        return id;
    }

    private List<String> fileKeys(UUID verification) {
        return jdbc.queryForList("select storage_key from identity_verification_files where verification_id = ?",
                String.class, verification);
    }

    private long fileRows(UUID verification) {
        return fileKeys(verification).size();
    }

    private Map<String, Object> identityRow(UUID id) {
        return jdbc.queryForMap("select * from identity_verifications where id = ?", id);
    }

    private Path storagePath(String key) {
        return Path.of(storageDir).resolve(key);
    }
}
