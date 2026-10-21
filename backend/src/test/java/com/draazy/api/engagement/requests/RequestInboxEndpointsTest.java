package com.draazy.api.engagement.requests;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.leads.contact.ContactUsageService;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

class RequestInboxEndpointsTest extends AbstractApiTest {

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;
    @Autowired
    ContactUsageService usage;
    @Autowired
    EntityManager em;
    @Autowired
    RequestSources sources;

    private void update(String sql, Object... args) {
        em.flush();
        jdbc.update(sql, args);
        em.clear();
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Person " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String title) {
        Property p = new Property(owner, title, "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setStatus("approved");
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        return properties.saveAndFlush(p);
    }

    private ResultActions as(User u, MockHttpServletRequestBuilder b) throws Exception {
        return mvc.perform(b.header(HttpHeaders.AUTHORIZATION, bearer(u)).contentType(MediaType.APPLICATION_JSON));
    }

    private UUID contactRequest(User buyer, Property p, String message) throws Exception {
        String body = message == null ? "{\"propertyId\":\"" + p.getId() + "\"}"
                : "{\"propertyId\":\"" + p.getId() + "\",\"message\":\"" + message + "\"}";
        as(buyer, post(Routes.Contacts.REQUEST).content(body)).andExpect(status().is2xxSuccessful());
        return jdbc.queryForObject("select id from contact_requests where requester_id = ? and property_id = ?",
                UUID.class, buyer.getId(), p.getId());
    }

    private UUID visit(User visitor, Property p) throws Exception {
        as(visitor, post(Routes.Visits.BASE).content("{\"propertyId\":\"" + p.getId() + "\",\"slot\":\""
                + Instant.now().plus(2, ChronoUnit.DAYS) + "\",\"mode\":\"in-person\"}")).andExpect(status().isCreated());
        return jdbc.queryForObject("select id from visits where visitor_id = ? and property_id = ?",
                UUID.class, visitor.getId(), p.getId());
    }

    private UUID documentRequest(User buyer, Property p, String categoriesJson, String message) throws Exception {
        String msg = message == null ? "" : ",\"message\":\"" + message + "\"";
        as(buyer, post(Routes.Documents.REQUESTS).content("{\"propertyId\":\"" + p.getId() + "\",\"categories\":"
                + categoriesJson + ",\"acknowledgedDisclaimer\":true" + msg + "}")).andExpect(status().isCreated());
        return jdbc.queryForObject("select id from document_requests where requester_id = ? and property_id = ? "
                + "and status = 'pending'", UUID.class, buyer.getId(), p.getId());
    }

    private String lastNotificationLink(User u, String type) {
        return jdbc.queryForObject("select link from notifications where user_id = ? and type = ? "
                + "order by created_at desc limit 1", String.class, u.getId(), type);
    }
    private String photoUrl(Property p) {
        return Routes.PropertyPhotoRequests.BASE.replace("{id}", p.getId().toString());
    }

    private UUID photoRequest(User buyer, Property p) throws Exception {
        as(buyer, post(photoUrl(p))).andExpect(status().is2xxSuccessful());
        return jdbc.queryForObject("select id from photo_requests where requester_id = ? and property_id = ?",
                UUID.class, buyer.getId(), p.getId());
    }

    private UUID flatmateInterest(User requester, User host) {
        UUID id = UUID.randomUUID();
        update("insert into flatmate_requests (id, kind, target_id, host_id, requester_id, message) "
                + "values (?, 'flatmate', ?, ?, ?, 'Hello there')", id, UUID.randomUUID(), host.getId(), requester.getId());
        return id;
    }

    private UUID groupApplication(User applicant, Property listing) {
        UUID group = UUID.randomUUID();
        update("insert into flatmate_groups (id, host_id, title, locality, rent, mod_status) "
                + "values (?, ?, 'Group', 'Kothrud', 30000, 'live')", group, applicant.getId());
        UUID id = UUID.randomUUID();
        update("insert into flatmate_group_applications (id, listing_id, group_id, applicant_id) "
                + "values (?, ?, ?, ?)", id, listing.getId(), group, applicant.getId());
        return id;
    }

    private String url(String kind, UUID id) {
        return Routes.MeRequests.BY_ID.replace("{kind}", kind).replace("{id}", id.toString());
    }

    private String remindUrl(String kind, UUID id) {
        return Routes.MeRequests.REMINDERS.replace("{kind}", kind).replace("{id}", id.toString());
    }

    private void backdate(String table, UUID id, int hours) {
        update("update " + table + " set created_at = created_at - make_interval(hours => ?) where id = ?", hours, id);
    }

    private String statusOf(String table, UUID id) {
        em.flush();
        return jdbc.queryForObject("select status from " + table + " where id = ?", String.class, id);
    }

    private long countOf(String table, UUID id) {
        em.flush();
        return jdbc.queryForObject("select count(*) from " + table + " where id = ?", Long.class, id);
    }

    private void ageWithdrawal(String table, UUID id) {
        update("alter table " + table + " disable trigger trg_set_updated_at");
        update("update " + table + " set updated_at = now() - interval '8 days' where id = ?", id);
    }

    private void backdateReminders(UUID refId, int hours) {
        update("update request_reminders set sent_at = sent_at - make_interval(hours => ?) where ref_id = ?",
                hours, refId);
    }

    private long notifications(User u, String type) {
        return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?", Long.class,
                u.getId(), type);
    }

    @Test
    void receivedBox_listsPendingRequestsOfEveryKind() throws Exception {
        User owner = user("9830000001", "owner");
        User buyer = user("9830000002", "buyer");
        UUID contact = contactRequest(buyer, listing(owner, "Contact flat"), "Is it available?");
        UUID visit = visit(buyer, listing(owner, "Visit flat"));
        UUID photo = photoRequest(buyer, listing(owner, "Photo flat"));
        UUID flatmate = flatmateInterest(buyer, owner);
        UUID group = groupApplication(buyer, listing(owner, "Group flat"));

        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(5))
                .andExpect(jsonPath("$.content[?(@.kind=='contact')].id").value(contact.toString()))
                .andExpect(jsonPath("$.content[?(@.kind=='contact')].message").value("Is it available?"))
                .andExpect(jsonPath("$.content[?(@.kind=='contact')].state").value("pending"))
                .andExpect(jsonPath("$.content[?(@.kind=='contact')].party.name").value("Person 9830000002"))
                .andExpect(jsonPath("$.content[?(@.kind=='contact')].target.title").value("Contact flat"))
                .andExpect(jsonPath("$.content[?(@.kind=='visit')].id").value(visit.toString()))
                .andExpect(jsonPath("$.content[?(@.kind=='visit')].slot").isNotEmpty())
                .andExpect(jsonPath("$.content[?(@.kind=='photo')].id").value(photo.toString()))
                .andExpect(jsonPath("$.content[?(@.kind=='flatmate')].id").value(flatmate.toString()))
                .andExpect(jsonPath("$.content[?(@.kind=='flatmate')].message").value("Hello there"))
                .andExpect(jsonPath("$.content[?(@.kind=='group')].id").value(group.toString()))
                .andExpect(jsonPath("$.content[0].reminders.count").value(0));

        as(buyer, get(Routes.MeRequests.BASE + "?box=received")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));
    }

    @Test
    void receivedBox_ranksRemindedRequestsFirst() throws Exception {
        User owner = user("9830000003", "owner");
        User buyer = user("9830000004", "buyer");
        UUID older = contactRequest(buyer, listing(owner, "Older"), null);
        UUID newer = photoRequest(buyer, listing(owner, "Newer"));
        backdate("contact_requests", older, 30);
        as(buyer, post(remindUrl("contact", older))).andExpect(status().isCreated());

        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].id").value(older.toString()))
                .andExpect(jsonPath("$.content[0].reminders.count").value(1))
                .andExpect(jsonPath("$.content[1].id").value(newer.toString()));
    }

    @Test
    void sentBox_listsRequestsWithTheirStateAndNextReminder_pendingFirst() throws Exception {
        User owner = user("9830000005", "owner");
        User buyer = user("9830000006", "buyer");
        UUID declined = contactRequest(buyer, listing(owner, "Declined"), null);
        update("update contact_requests set status = 'declined' where id = ?", declined);
        UUID pending = photoRequest(buyer, listing(owner, "Pending"));

        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[0].id").value(pending.toString()))
                .andExpect(jsonPath("$.content[0].state").value("pending"))
                .andExpect(jsonPath("$.content[0].party.name").value("Person 9830000005"))
                .andExpect(jsonPath("$.content[0].reminders.nextAt").isNotEmpty())
                .andExpect(jsonPath("$.content[1].id").value(declined.toString()))
                .andExpect(jsonPath("$.content[1].state").value("declined"))
                .andExpect(jsonPath("$.content[1].reminders.nextAt").doesNotExist());
    }

    @Test
    void list_rejectsAnUnknownBox() throws Exception {
        as(user("9830000007", "buyer"), get(Routes.MeRequests.BASE + "?box=archive"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("invalid_box"));
    }

    @Test
    void reminder_isRefusedForSomeoneElsesAndMissingRequests() throws Exception {
        User owner = user("9830000008", "owner");
        User buyer = user("9830000009", "buyer");
        UUID id = contactRequest(buyer, listing(owner, "Not yours"), null);
        backdate("contact_requests", id, 30);

        as(owner, post(remindUrl("contact", id))).andExpect(status().isNotFound());
        as(buyer, post(remindUrl("contact", UUID.randomUUID()))).andExpect(status().isNotFound());
        as(buyer, post(remindUrl("nonsense", id))).andExpect(status().isNotFound());
    }

    @Test
    void reminder_waitsADayAfterSendingAndADayAfterTheLastReminder() throws Exception {
        User owner = user("9830000010", "owner");
        User buyer = user("9830000011", "buyer");
        UUID id = contactRequest(buyer, listing(owner, "Patient"), null);

        as(buyer, post(remindUrl("contact", id))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("reminder_too_soon"))
                .andExpect(jsonPath("$.nextReminderAt").isNotEmpty());

        backdate("contact_requests", id, 25);
        as(buyer, post(remindUrl("contact", id))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.count").value(1))
                .andExpect(jsonPath("$.lastAt").isNotEmpty())
                .andExpect(jsonPath("$.nextAt").isNotEmpty());
        assertThat(notifications(owner, "request.reminder")).isEqualTo(1);

        as(buyer, post(remindUrl("contact", id))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("reminder_too_soon"));

        backdateReminders(id, 25);
        as(buyer, post(remindUrl("contact", id))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.count").value(2));
    }

    @Test
    void reminder_notifiesTheRecipientAtMostOncePerDayAcrossRequests() throws Exception {
        User owner = user("9830000012", "owner");
        User buyer = user("9830000013", "buyer");
        User otherBuyer = user("9830000014", "buyer");
        UUID first = contactRequest(buyer, listing(owner, "One"), null);
        UUID second = photoRequest(otherBuyer, listing(owner, "Two"));
        backdate("contact_requests", first, 25);
        backdate("photo_requests", second, 25);

        as(buyer, post(remindUrl("contact", first))).andExpect(status().isCreated());
        as(otherBuyer, post(remindUrl("photo", second))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.count").value(1));

        assertThat(notifications(owner, "request.reminder")).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from request_reminders where recipient_id = ?", Long.class,
                owner.getId())).isEqualTo(2);
    }

    @Test
    void reminder_isNotAllowedOnADecidedRequest() throws Exception {
        User owner = user("9830000015", "owner");
        User buyer = user("9830000016", "buyer");
        UUID id = contactRequest(buyer, listing(owner, "Decided"), null);
        backdate("contact_requests", id, 25);
        update("update contact_requests set status = 'declined' where id = ?", id);

        as(buyer, post(remindUrl("contact", id))).andExpect(status().isNotFound());
    }

    @Test
    void withdrawingAContactRequest_returnsTheCreditAndLeavesTheOwnersInbox() throws Exception {
        User owner = user("9830000017", "owner");
        User buyer = user("9830000018", "buyer");
        Property p = listing(owner, "Withdrawn");
        UUID id = contactRequest(buyer, p, null);
        assertThat(usage.contactTimes(buyer.getId())).hasSize(1);

        as(buyer, delete(url("contact", id))).andExpect(status().isNoContent());

        assertThat(usage.contactTimes(buyer.getId())).isEmpty();
        as(owner, get(Routes.MeContactRequests.BASE)).andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));
        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(jsonPath("$.content.length()").value(0));
        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content[0].state")
                .value("withdrawn"));
        as(buyer, get(Routes.Contacts.STATUS + "?propertyId=" + p.getId())).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("none"));
    }

    @Test
    void reRequestingAfterAWithdrawal_isBlockedForSevenDays_thenRenewsTheRequest() throws Exception {
        User owner = user("9830000019", "owner");
        User buyer = user("9830000020", "buyer");
        Property p = listing(owner, "Cooling off");
        UUID id = contactRequest(buyer, p, null);
        as(buyer, delete(url("contact", id))).andExpect(status().isNoContent());

        as(buyer, post(Routes.Contacts.REQUEST).content("{\"propertyId\":\"" + p.getId() + "\"}"))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.error").value("recently_withdrawn"));

        ageWithdrawal("contact_requests", id);
        as(buyer, post(Routes.Contacts.REQUEST).content("{\"propertyId\":\"" + p.getId() + "\",\"message\":\"Again\"}"))
                .andExpect(status().is2xxSuccessful());
        assertThat(statusOf("contact_requests", id))
                .isEqualTo("pending");
    }

    @Test
    void clearing_hidesADecidedRequestFromTheSentBoxOnly() throws Exception {
        User owner = user("9830000021", "owner");
        User buyer = user("9830000022", "buyer");
        UUID id = contactRequest(buyer, listing(owner, "Cleared"), null);
        update("update contact_requests set status = 'declined' where id = ?", id);

        as(buyer, delete(url("contact", id))).andExpect(status().isNoContent());
        as(buyer, delete(url("contact", id))).andExpect(status().isNoContent());

        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content.length()").value(0));
        assertThat(statusOf("contact_requests", id))
                .isEqualTo("declined");
        as(owner, delete(url("contact", id))).andExpect(status().isNotFound());
    }

    @Test
    void clearing_coversOnlyTheOutcomeSeen_soAReAskShowsUpAgain() throws Exception {
        User owner = user("9830000031", "owner");
        User buyer = user("9830000032", "buyer");
        Property p = listing(owner, "Asked again");
        UUID id = contactRequest(buyer, p, null);
        as(buyer, delete(url("contact", id))).andExpect(status().isNoContent());
        as(buyer, delete(url("contact", id))).andExpect(status().isNoContent());
        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content.length()").value(0));

        ageWithdrawal("contact_requests", id);
        as(buyer, post(Routes.Contacts.REQUEST).content("{\"propertyId\":\"" + p.getId() + "\"}"))
                .andExpect(status().is2xxSuccessful());

        as(buyer, get(Routes.MeRequests.BASE + "?box=sent"))
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(id.toString()))
                .andExpect(jsonPath("$.content[0].state").value("pending"));
    }

    @Test
    void withdrawingAVisit_cancelsItAndReadsAsWithdrawn_andRebookingWaitsADay() throws Exception {
        User owner = user("9830000023", "owner");
        User visitor = user("9830000024", "buyer");
        Property flat = listing(owner, "Visit flat");
        UUID id = visit(visitor, flat);

        as(visitor, delete(url("visit", id))).andExpect(status().isNoContent());

        assertThat(statusOf("visits", id))
                .isEqualTo("cancelled");
        as(visitor, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content[0].state")
                .value("withdrawn"));
        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(jsonPath("$.content.length()").value(0));

        String rebook = "{\"propertyId\":\"" + flat.getId() + "\",\"slot\":\""
                + Instant.now().plus(3, ChronoUnit.DAYS) + "\",\"mode\":\"in-person\"}";
        as(visitor, post(Routes.Visits.BASE).content(rebook)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("recently_withdrawn"));
        update("alter table visits disable trigger trg_set_updated_at");
        update("update visits set updated_at = now() - interval '25 hours' where id = ?", id);
        as(visitor, post(Routes.Visits.BASE).content(rebook)).andExpect(status().isCreated());
    }

    @Test
    void withdrawingAPhotoRequest_blocksAskingAgainForSevenDays() throws Exception {
        User owner = user("9830000025", "owner");
        User buyer = user("9830000026", "buyer");
        Property p = listing(owner, "Photo flat");
        UUID id = photoRequest(buyer, p);

        as(buyer, delete(url("photo", id))).andExpect(status().isNoContent());
        assertThat(statusOf("photo_requests", id))
                .isEqualTo("withdrawn");
        as(owner, get(Routes.MePhotoRequests.BASE)).andExpect(jsonPath("$.content.length()").value(0));

        as(buyer, post(photoUrl(p))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("recently_withdrawn"));

        ageWithdrawal("photo_requests", id);
        as(buyer, post(photoUrl(p))).andExpect(status().is2xxSuccessful());
        assertThat(statusOf("photo_requests", id))
                .isEqualTo("pending");
    }

    @Test
    void withdrawingAGroupApplication_marksItWithdrawn_andReapplyingWaitsSevenDays() throws Exception {
        User owner = user("9830000027", "owner");
        User applicant = user("9830000028", "buyer");
        Property flat = listing(owner, "Group flat");
        UUID id = groupApplication(applicant, flat);
        UUID group = jdbc.queryForObject("select group_id from flatmate_group_applications where id = ?", UUID.class, id);
        String apply = Routes.Flatmates.GROUP_APPLY.replace("{id}", group.toString());
        String body = "{\"listingId\":\"" + flat.getId() + "\"}";

        as(applicant, delete(url("group", id))).andExpect(status().isNoContent());

        assertThat(statusOf("flatmate_group_applications", id))
                .isEqualTo("withdrawn");
        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(jsonPath("$.content.length()").value(0));
        as(applicant, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content[0].state")
                .value("withdrawn"));

        as(applicant, post(apply).content(body)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("recently_withdrawn"));
        update("update flatmate_group_applications set decided_at = now() - interval '8 days' where id = ?", id);
        as(applicant, post(apply).content(body)).andExpect(status().isCreated());
        assertThat(statusOf("flatmate_group_applications", id))
                .isEqualTo("pending");
    }

    @Test
    void withdrawingAFlatmateInterest_deletesThePendingRow_butKeepsItInTheSendLedger() throws Exception {
        User host = user("9830000029", "owner");
        User seeker = user("9830000030", "buyer");
        UUID id = flatmateInterest(seeker, host);
        UUID target = jdbc.queryForObject("select target_id from flatmate_requests where id = ?", UUID.class, id);

        as(seeker, delete(url("flatmate", id))).andExpect(status().isNoContent());

        assertThat(countOf("flatmate_requests", id))
                .isZero();
        assertThat(jdbc.queryForObject("select count(*) from flatmate_interest_withdrawals "
                + "where requester_id = ? and kind = 'flatmate' and target_id = ?", Long.class, seeker.getId(), target))
                .isEqualTo(1);
        as(seeker, delete(url("flatmate", id))).andExpect(status().isNotFound());
    }

    @Test
    void documentRequest_showsInTheOwnersReceivedBoxAndTheBuyersSentBox() throws Exception {
        User owner = user("9830000040", "owner");
        User buyer = user("9830000041", "buyer");
        Property p = listing(owner, "Doc flat");
        UUID id = documentRequest(buyer, p, "[\"Sale Deed\",\"Index II\"]", null);
        UUID noted = documentRequest(user("9830000042", "buyer"), p, "[]", "For my lawyer");

        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].kind").value("document"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].state").value("pending"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].status").value("pending"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].message").value("Wants to see: Sale Deed, Index II"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].party.id").value(buyer.getId().toString()))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].party.name").value("Person 9830000041"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].target.type").value("property"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].target.title").value("Doc flat"))
                .andExpect(jsonPath("$.content[?(@.id=='" + noted + "')].message").value("For my lawyer"));

        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(id.toString()))
                .andExpect(jsonPath("$.content[0].kind").value("document"))
                .andExpect(jsonPath("$.content[0].party.id").value(owner.getId().toString()))
                .andExpect(jsonPath("$.content[0].target.link").value(org.hamcrest.Matchers.startsWith("/property/")))
                .andExpect(jsonPath("$.content[0].reminders.nextAt").isNotEmpty());
        as(buyer, get(Routes.MeRequests.BASE + "?box=received")).andExpect(jsonPath("$.content.length()").value(0));
    }

    @Test
    void documentRequest_decisionsReadAsAcceptedDeclinedOrExpired_andAClearHidesThem() throws Exception {
        User owner = user("9830000043", "owner");
        User buyer = user("9830000044", "buyer");
        UUID granted = documentRequest(buyer, listing(owner, "Granted"), "[]", null);
        UUID declined = documentRequest(buyer, listing(owner, "Declined"), "[]", null);
        UUID lapsed = documentRequest(buyer, listing(owner, "Lapsed"), "[]", null);
        update("update document_requests set status = 'granted', expires_at = now() + interval '3 days' where id = ?",
                granted);
        update("update document_requests set status = 'declined' where id = ?", declined);
        update("update document_requests set status = 'granted', expires_at = now() - interval '1 hour' where id = ?",
                lapsed);

        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content.length()").value(3))
                .andExpect(jsonPath("$.content[?(@.id=='" + granted + "')].state").value("accepted"))
                .andExpect(jsonPath("$.content[?(@.id=='" + declined + "')].state").value("declined"))
                .andExpect(jsonPath("$.content[?(@.id=='" + lapsed + "')].state").value("expired"));
        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(jsonPath("$.content.length()").value(0));

        as(buyer, delete(url("document", declined))).andExpect(status().isNoContent());

        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content.length()").value(2));
        assertThat(statusOf("document_requests", declined)).isEqualTo("declined");
    }

    @Test
    void withdrawingADocumentRequest_removesItFromTheOwnersViews_andReAskingWaitsSevenDays() throws Exception {
        User owner = user("9830000045", "owner");
        User buyer = user("9830000046", "buyer");
        Property p = listing(owner, "Withdrawn docs");
        UUID id = documentRequest(buyer, p, "[\"Sale Deed\"]", null);

        as(buyer, delete(url("document", id))).andExpect(status().isNoContent());

        assertThat(statusOf("document_requests", id)).isEqualTo("withdrawn");
        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(jsonPath("$.content.length()").value(0));
        as(owner, get(Routes.MeDocuments.REQUESTS)).andExpect(jsonPath("$.content.length()").value(0));
        as(buyer, get(Routes.MeRequests.BASE + "?box=sent")).andExpect(jsonPath("$.content[0].state")
                .value("withdrawn"));
        as(owner, patch(Routes.MeDocuments.REQUEST_BY_ID.replace("{reqId}", id.toString()))
                .content("{\"status\":\"granted\"}")).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select share_token from document_requests where id = ?", String.class, id))
                .isNull();

        String ask = "{\"propertyId\":\"" + p.getId() + "\",\"categories\":[],\"acknowledgedDisclaimer\":true}";
        as(buyer, post(Routes.Documents.REQUESTS).content(ask)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("recently_withdrawn"));

        ageWithdrawal("document_requests", id);
        as(buyer, post(Routes.Documents.REQUESTS).content(ask)).andExpect(status().isCreated());
        as(owner, get(Routes.MeRequests.BASE + "?box=received")).andExpect(jsonPath("$.content.length()").value(1));
    }

    @Test
    void withdrawingADocumentRequest_theOwnerAnsweredFirst_isAConflict() throws Exception {
        User owner = user("9830000047", "owner");
        User buyer = user("9830000048", "buyer");
        UUID id = documentRequest(buyer, listing(owner, "Answered first"), "[]", null);
        update("update document_requests set status = 'declined' where id = ?", id);

        assertThatThrownBy(() -> sources.of("document").withdraw(buyer.getId(), id))
                .isInstanceOf(ConflictException.class);
        assertThat(statusOf("document_requests", id)).isEqualTo("declined");
    }

    @Test
    void reminder_onADocumentRequest_notifiesTheOwnerWithoutOpeningAConversation() throws Exception {
        User owner = user("9830000049", "owner");
        User buyer = user("9830000050", "buyer");
        UUID id = documentRequest(buyer, listing(owner, "Nudge docs"), "[]", null);
        backdate("document_requests", id, 25);

        as(buyer, post(remindUrl("document", id))).andExpect(status().isCreated())
                .andExpect(jsonPath("$.count").value(1));

        assertThat(lastNotificationLink(owner, "request.reminder")).isEqualTo("/dashboard?tab=leads&box=received");
    }

    @Test
    void reminder_onAContactRequest_linksToItsConversationEntry() throws Exception {
        User owner = user("9830000051", "owner");
        User buyer = user("9830000052", "buyer");
        UUID id = contactRequest(buyer, listing(owner, "Nudge contact"), null);
        backdate("contact_requests", id, 25);

        as(buyer, post(remindUrl("contact", id))).andExpect(status().isCreated());

        assertThat(lastNotificationLink(owner, "request.reminder")).isEqualTo("/messages?c=request:contact:" + id);
    }
    @Test
    void inbox_requiresSignIn() throws Exception {
        mvc.perform(get(Routes.MeRequests.BASE)).andExpect(status().isUnauthorized());
    }
}
