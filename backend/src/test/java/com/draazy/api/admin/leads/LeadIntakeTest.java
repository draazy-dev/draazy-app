package com.draazy.api.admin.leads;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.managed.ManagedAgreementHomes;
import com.draazy.api.catalog.managed.ManagedAgreementHomes.Lease;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.identity.user.User;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Leads CRM intake: every signal for one person lands on one lead")
class LeadIntakeTest extends LeadsTestBase {
    private static final String TENANT = "9877100002";

    @Autowired LeadIntake intake;
    @Autowired LeadIngest ingest;
    @Autowired LeadRelease release;
    @Autowired ManagedAgreementHomes homes;

    private UUID request(User owner, String type, String status, String age) {
        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into service_requests (id, requester_id, type, team, status, details, created_at)
                values (?, ?, ?, ?, ?, '{}'::jsonb, now() - cast(? as interval))
                """, id, owner.getId(), type, type.equals("rent-agreement") ? "rental" : type, status, age);
        return id;
    }

    private UUID home(User owner, String flatKey, LocalDate leaseEnd) {
        return homes.record(new Lease(owner.getId(), null, flatKey, null, "Flat / Apartment", new BigDecimal("2"),
                "Kothrud", "Green Meadows", new BigDecimal("950"), "sqft", "Kiran Tenant", TENANT, 25000, 5,
                leaseEnd, 100000L, request(owner, "rent-agreement", "completed", "1 day")), null);
    }

    private void consent(User user) {
        jdbc.update("""
                insert into notification_preferences (user_id, marketing_consent_at) values (?, now())
                on conflict (user_id) do update set marketing_consent_at = now()
                """, user.getId());
    }

    private UUID leadOf(String mobile) {
        return jdbc.queryForObject("select id from crm_leads where mobile = ?", UUID.class, mobile);
    }

    private List<String> interestsOf(String mobile) {
        return jdbc.queryForList("select unnest(interests) from crm_leads where mobile = ? order by 1",
                String.class, mobile);
    }

    private int signals(String mobile) {
        return count("select count(*) from crm_lead_signals where lead_id = ?", leadOf(mobile));
    }

    private void ticket(String team, String mobile, User requester) {
        jdbc.update("insert into tickets (subject, team, customer, mobile, requester_id) values (?, ?, ?, ?, ?)",
                "Quote for " + team, team, "Quote Customer", mobile, requester == null ? null : requester.getId());
    }

    @Test
    @DisplayName("an owner seen as a rent-agreement party and as a lease ending is one lead with merged interests")
    void twoSourcesOneLead() {
        User owner = user("9877100001", "owner", "Asha Patil");
        consent(owner);
        home(owner, "A-1", LocalDate.now(PlatformTime.IST).plusDays(30));

        intake.sweep();

        assertThat(count("select count(*) from crm_leads where mobile = ?", "9877100001")).isEqualTo(1);
        assertThat(signals("9877100001")).isEqualTo(2);
        assertThat(interestsOf("9877100001")).containsExactly("interior", "legal", "listing", "rent-agreement",
                "valuation");
        assertThat(jdbc.queryForObject("select user_id from crm_leads where mobile = ?", UUID.class, "9877100001"))
                .isEqualTo(owner.getId());
        assertThat(interestsOf(TENANT)).containsExactly("interior", "packers");
    }

    @Test
    @DisplayName("a feed row with an unusable mobile is marked rejected so the feed stops re-selecting it")
    void unusableRowIsRejectedOnce() {
        LeadIngest.Incoming bad = new LeadIngest.Incoming("quote-request", "reject-ref-1", "12345", "Bad Mobile",
                List.of("packers"), "Quote", null);

        assertThat(ingest.ingest(bad)).isEmpty();
        assertThat(ingest.ingest(bad)).isEmpty();

        assertThat(count("select count(*) from crm_lead_signals where source = 'quote-request'"
                + " and source_ref = ? and lead_id is null", "reject-ref-1")).isEqualTo(1);
        assertThat(count("select count(*) from crm_leads where mobile = ?", "12345")).isZero();
    }

    @Test
    @DisplayName("a second sweep over the same rows changes nothing")
    void sweepIsIdempotent() {
        User owner = user("9877100011", "owner", "Asha Patil");
        home(owner, "A-1", LocalDate.now(PlatformTime.IST).plusDays(300));
        intake.sweep();
        jdbc.update("update crm_leads set last_signal_at = now() - interval '1 day' where mobile = ?",
                "9877100011");

        intake.sweep();

        assertThat(signals("9877100011")).isEqualTo(1);
        assertThat(count("select count(*) from crm_leads where mobile = ? and last_signal_at < now()",
                "9877100011")).isEqualTo(1);
    }

    @Test
    @DisplayName("lease-ending leads include only parties who opted in, inside the sixty-day window")
    void leaseEndingIsConsentGated() {
        User consenting = user("9877100021", "owner", "Consenting Owner");
        User silent = user("9877100022", "owner", "Silent Owner");
        User tooFar = user("9877100023", "owner", "Far Owner");
        consent(consenting);
        consent(tooFar);
        home(consenting, "B-1", LocalDate.now(PlatformTime.IST).plusDays(10));
        home(silent, "B-2", LocalDate.now(PlatformTime.IST).plusDays(10));
        home(tooFar, "B-3", LocalDate.now(PlatformTime.IST).plusDays(90));

        intake.sweep();

        assertThat(count("select count(*) from crm_lead_signals where source = 'lease-ending' and lead_id = ?",
                leadOf("9877100021"))).isEqualTo(1);
        assertThat(count("select count(*) from crm_lead_signals where source = 'lease-ending' and lead_id = ?",
                leadOf("9877100022"))).isZero();
        assertThat(count("select count(*) from crm_lead_signals where source = 'lease-ending' and lead_id = ?",
                leadOf("9877100023"))).isZero();
    }

    @Test
    @DisplayName("quote tickets and old unpaid checkouts become leads; fresh, paid-later and staff rows do not")
    void quotesAndCheckouts() {
        ticket("rental", "9877100031", null);
        ticket("legal", "9877100032", null);
        User staffer = staff("9877100033", "Desk Staff");
        ticket("legal", "9877100034", staffer);

        User abandoned = user("9877100041", "buyer", "Abandoned Buyer");
        request(abandoned, "packers", "awaiting-payment", "5 hours");
        User fresh = user("9877100042", "buyer", "Fresh Buyer");
        request(fresh, "packers", "awaiting-payment", "10 minutes");
        User paidLater = user("9877100043", "buyer", "Paid Later");
        request(paidLater, "legal", "awaiting-payment", "3 days");
        request(paidLater, "legal", "new", "2 days");
        User cancelled = user("9877100044", "buyer", "Cancelled Buyer");
        UUID gone = request(cancelled, "interior", "cancelled", "4 days");
        jdbc.update("insert into service_request_timeline (request_id, event) values (?, 'payment.abandoned')", gone);

        intake.sweep();

        assertThat(interestsOf("9877100031")).containsExactly("rent-agreement");
        assertThat(interestsOf("9877100032")).containsExactly("legal");
        assertThat(count("select count(*) from crm_leads where mobile = ?", "9877100034")).isZero();
        assertThat(interestsOf("9877100041")).containsExactly("packers");
        assertThat(count("select count(*) from crm_leads where mobile = ?", "9877100042")).isZero();
        assertThat(count("select count(*) from crm_leads where mobile = ?", "9877100043")).isZero();
        assertThat(interestsOf("9877100044")).containsExactly("interior");
    }

    @Test
    @DisplayName("staff and archived accounts never become leads")
    void skipsBackOfficeAndInvalid() {
        User staffer = staff("9877100051", "Desk Staff");
        ticket("legal", staffer.getMobile(), null);
        User archived = user("9877100053", "buyer", "Gone");
        request(archived, "packers", "awaiting-payment", "5 hours");
        jdbc.update("update users set archived = true where id = ?", archived.getId());

        intake.sweep();

        assertThat(count("select count(*) from crm_leads where mobile in (?, ?)", "9877100051",
                "9877100053")).isZero();
    }

    @Test
    @DisplayName("a do-not-call lead never resurfaces, whatever new signal arrives")
    void doNotCallStaysClosed() {
        User owner = staff("9877100061", "Ravi");
        UUID id = lead("9877100062", "do-not-call", owner);
        ticket("legal", "9877100062", null);

        intake.sweep();

        assertThat(stageOf(id)).isEqualTo("do-not-call");
        assertThat(ownerOf(id)).isEqualTo(owner.getId());
        assertThat(count("select count(*) from crm_lead_signals where lead_id = ?", id)).isLessThanOrEqualTo(1);
        assertThat(interestsOf("9877100062")).isEmpty();
    }

    @Test
    @DisplayName("a lost or not-reachable lead returns to new with its owner kept")
    void lostLeadResurfaces() {
        User owner = staff("9877100071", "Ravi");
        UUID lost = lead("9877100072", "lost", owner);
        UUID gone = lead("9877100073", "not-reachable", null);
        jdbc.update("update crm_leads set failed_attempts = 3 where id in (?, ?)", lost, gone);
        ticket("legal", "9877100072", null);
        ticket("legal", "9877100073", null);

        intake.sweep();

        assertThat(stageOf(lost)).isEqualTo("new");
        assertThat(ownerOf(lost)).isEqualTo(owner.getId());
        assertThat(stageOf(gone)).isEqualTo("new");
        assertThat(count("select failed_attempts from crm_leads where id = ?", lost)).isZero();
    }

    @Test
    @DisplayName("live flatmate posts and rooms become flatmate leads with their budget and locality")
    void flatmatesBecomeLeads() {
        User seeker = user("9877100091", "buyer", "Seeker Sana");
        User host = user("9877100092", "owner", "Host Harsh");
        User pending = user("9877100093", "buyer", "Pending Pia");
        jdbc.update("insert into flatmate_seeker_posts (user_id, name, budget, localities, mod_status) "
                + "values (?, 'Sana', 12000, '[\"Baner\",\"Aundh\"]'::jsonb, 'live')", seeker.getId());
        jdbc.update("insert into flatmate_seeker_posts (user_id, name, budget, mod_status) "
                + "values (?, 'Pia', 9000, 'pending')", pending.getId());
        jdbc.update("insert into flatmate_rooms (host_id, room_type, budget, locality, bhk, mod_status) "
                + "values (?, 'Private room', 15000, 'Wakad', '2', 'approved')", host.getId());

        intake.sweep();
        intake.sweep();

        assertThat(jdbc.queryForMap("select name, lead_type, intent, localities, budget, lead_source "
                + "from crm_leads where mobile = '9877100091'")).containsEntry("name", "Sana")
                .containsEntry("lead_type", "flatmate").containsEntry("intent", "needs-room")
                .containsEntry("localities", "Baner, Aundh").containsEntry("budget", 12000L)
                .containsEntry("lead_source", "draazy");
        assertThat(jdbc.queryForMap("select intent, localities, budget, array_to_string(bhk, ',') as bhk "
                + "from crm_leads where mobile = '9877100092'")).containsEntry("intent", "has-room")
                .containsEntry("localities", "Wakad").containsEntry("budget", 15000L).containsEntry("bhk", "2");
        assertThat(interestsOf("9877100092")).containsExactly("rent-agreement");
        assertThat(signals("9877100091")).isEqualTo(1);
        assertThat(count("select count(*) from crm_leads where mobile = ?", "9877100093")).isZero();
    }

    @Test
    @DisplayName("idle release frees owned open leads after 72 hours and leaves active ones alone")
    void idleRelease() {
        User owner = staff("9877100081", "Ravi");
        UUID idle = lead("9877100082", "contacted", owner);
        UUID scheduled = lead("9877100083", "contacted", owner);
        UUID active = lead("9877100084", "contacted", owner);
        UUID closed = lead("9877100085", "lost", owner);
        jdbc.update("update crm_leads set claimed_at = now() - interval '4 days' where id in (?, ?, ?, ?)",
                idle, scheduled, active, closed);
        jdbc.update("update crm_leads set next_follow_up_at = now() + interval '1 day' where id = ?", scheduled);
        jdbc.update("update crm_leads set last_activity_at = now() - interval '1 hour' where id = ?", active);

        release.releaseIdle();

        assertThat(ownerOf(idle)).isNull();
        assertThat(ownerOf(scheduled)).isEqualTo(owner.getId());
        assertThat(ownerOf(active)).isEqualTo(owner.getId());
        assertThat(ownerOf(closed)).isEqualTo(owner.getId());
        assertThat(count("select count(*) from crm_lead_activities where lead_id = ? and kind = 'release' "
                + "and actor_id is null", idle)).isEqualTo(1);
    }
}
