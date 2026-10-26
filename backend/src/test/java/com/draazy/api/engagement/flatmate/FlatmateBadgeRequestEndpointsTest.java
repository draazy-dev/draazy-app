package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.Document;
import com.draazy.api.documents.vault.DocumentRepository;
import com.draazy.api.documents.vault.PersonalDocument;
import com.draazy.api.documents.vault.PersonalDocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.draazy.api.support.UploadedPhotos;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Flatmates - badge request on a room already posted")
class FlatmateBadgeRequestEndpointsTest extends AbstractApiTest {

    private static final String SOCIETY = "Badge Heights";

    @Autowired
    UserRepository users;

    @Autowired
    PersonalDocumentRepository personalDocuments;

    @Autowired
    PropertyRepository properties;

    @Autowired
    DocumentRepository documents;

    @PersistenceContext
    EntityManager entityManager;

    private final List<String> createdActors = new ArrayList<>();

    @AfterEach
    void removeRowsThatEscapedRollback() {
        createdActors.forEach(actor -> {
            jdbc.update("delete from audit_log where actor = ?", actor);
            jdbc.update("delete from flatmate_owner_consents where granted_by = ?::uuid", actor);
        });
        createdActors.clear();
    }

    private User user(String mobile, String role) {
        return user(mobile, role, true);
    }

    private User user(String mobile, String role, boolean idVerified) {
        User u = new User(mobile, role);
        u.setName("Tester " + mobile);
        u.setMobileVerified(true);
        u.setVerified(idVerified);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private String ownerMobile(User host) {
        return "983" + host.getMobile().substring(3);
    }

    private String roomBody(User host, String role) {
        String photo = String.join("\",\"", UploadedPhotos.of(host.getId()),
                UploadedPhotos.of(host.getId()), UploadedPhotos.of(host.getId()));
        return withSocietyIds("""
                {"bhk":"2","roomType":"Private room","attachedBath":"attached","locality":"Baner",
                 "society":"%s","rentShare":15000,"deposit":30000,"hostRole":"%s",
                 "ownerConsent":true,"ownerConsentMobile":"%s","photos":["%s"],%s,%s}
                """.formatted(SOCIETY, role, ownerMobile(host), photo, FlatmateRoomFixture.BASICS,
                FlatmateRoomFixture.DETAILS));
    }

    private String postRoom(User host, String role) throws Exception {
        String json = mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(roomBody(host, role)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = com.jayway.jsonpath.JsonPath.read(json, "$.id");
        jdbc.update("update flatmate_rooms set mod_status = 'approved' where id = ?::uuid", id);
        entityManager.clear();
        return id;
    }

    private String doc(User owner, String category) {
        return personalDocuments.saveAndFlush(new PersonalDocument(owner.getId(), category, "a.pdf",
                "personal/" + owner.getId() + "/" + UUID.randomUUID(), 1024L, "application/pdf"))
                .getId().toString();
    }

    private String propertyVaultDoc(User owner) {
        Property flat = properties.saveAndFlush(new Property(owner, "Flat in Baner", "rent", "apartment",
                45000L, "Baner", "Pune"));
        return documents.saveAndFlush(new Document(flat.getId(), "Rent agreement", "a.pdf",
                "documents/" + flat.getId() + "/" + UUID.randomUUID(), 1024L, "application/pdf"))
                .getId().toString();
    }

    private static String badgeBody(String docId) {
        return badgeBody(docId, LocalDate.now().minusMonths(1), LocalDate.now().plusMonths(10));
    }

    private static String badgeBody(String docId, LocalDate from, LocalDate till) {
        return "{\"agreementDoc\":{\"id\":\"%s\",\"validFrom\":\"%s\",\"validTill\":\"%s\"}}"
                .formatted(docId, from, till);
    }

    private org.springframework.test.web.servlet.ResultActions request(User caller, String roomId,
            String docId) throws Exception {
        var req = post(Routes.Flatmates.ROOM_BADGE_REQUEST, roomId)
                .contentType(MediaType.APPLICATION_JSON)
                .content(badgeBody(docId));
        if (caller != null) {
            req.header(HttpHeaders.AUTHORIZATION, bearer(caller));
        }
        return mvc.perform(req);
    }

    private Map<String, Object> roomRow(String roomId) {
        return jdbc.queryForMap("select mod_status, verification_tier, agreement_declared, title, "
                + "budget, host_role from flatmate_rooms where id = ?::uuid", roomId);
    }

    private int reviewCount(String roomId) {
        return jdbc.queryForObject("select count(*) from flatmate_reviews where room_id = ?::uuid",
                Integer.class, roomId);
    }

    private String reviewField(String roomId, String column) {
        return jdbc.queryForObject("select " + column + "::text from flatmate_reviews where room_id = ?::uuid",
                String.class, roomId);
    }

    private void decide(User staff, String roomId, String body, int expected) throws Exception {
        mvc.perform(patch(Routes.Moderation.FLATMATE_REVIEW_BY_ID, reviewField(roomId, "id"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().is(expected));
        entityManager.clear();
    }

    private void giveOwnerConsent(User host) throws Exception {
        String mobile = ownerMobile(host);
        String payload = "{\"ownerMobile\":\"%s\",\"society\":\"%s\",\"locality\":\"Baner\"%s}";
        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload.formatted(mobile, SOCIETY, "")))
                .andExpect(status().isOk());
        entityManager.flush();
        jdbc.update("""
                update otp_codes set code_hash = ?
                where id = (select id from otp_codes where mobile = ? order by created_at desc limit 1)""",
                sha256Hex("424242"), mobile);
        entityManager.clear();
        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload.formatted(mobile, SOCIETY, ",\"otp\":\"424242\"")))
                .andExpect(status().isOk());
    }

    private static String sha256Hex(String raw) throws Exception {
        return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("files a pending review and flips only the badge fields, leaving publication alone")
    void filesReviewWithoutTouchingPublication() throws Exception {
        User host = user("9820000101", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        Map<String, Object> before = roomRow(roomId);
        assertThat(before.get("agreement_declared")).isEqualTo(false);
        assertThat(reviewCount(roomId)).isZero();

        request(host, roomId, doc(host, "Rent agreement"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(roomId))
                .andExpect(jsonPath("$.verificationTier").value("tenant"))
                .andExpect(jsonPath("$.modStatus").value("approved"));

        Map<String, Object> after = roomRow(roomId);
        assertThat(after.get("mod_status")).isEqualTo("approved");
        assertThat(after.get("agreement_declared")).isEqualTo(true);
        assertThat(after.get("verification_tier")).isEqualTo("tenant");
        assertThat(after.get("title")).isEqualTo(before.get("title"));
        assertThat(after.get("budget")).isEqualTo(before.get("budget"));
        assertThat(reviewCount(roomId)).isEqualTo(1);
        assertThat(reviewField(roomId, "status")).isEqualTo("pending");
        mvc.perform(get(Routes.Flatmates.MY_ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(host)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].hostRole").value("tenant"))
                .andExpect(jsonPath("$.content[0].verificationTier").value("tenant"))
                .andExpect(jsonPath("$.content[0].reviewStatus").value("pending"));
    }

    @Test
    @DisplayName("is idempotent: repeating it keeps one pending review")
    void repeatIsIdempotent() throws Exception {
        User host = user("9820000102", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        String docId = doc(host, "Rent agreement");
        request(host, roomId, docId).andExpect(status().isOk());
        request(host, roomId, docId).andExpect(status().isOk());
        assertThat(reviewCount(roomId)).isEqualTo(1);
        assertThat(reviewField(roomId, "status")).isEqualTo("pending");
    }

    @Test
    @DisplayName("a stranger gets 404 and an anonymous caller 401")
    void authAndOwnership() throws Exception {
        User host = user("9820000103", Roles.Wire.BUYER);
        User stranger = user("9820000104", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        request(stranger, roomId, doc(stranger, "Rent agreement")).andExpect(status().isNotFound());
        request(null, roomId, UUID.randomUUID().toString()).andExpect(status().isUnauthorized());
        assertThat(reviewCount(roomId)).isZero();
    }

    @Test
    @DisplayName("refuses another user's document, a missing one and a non-agreement one")
    void documentValidation() throws Exception {
        User host = user("9820000105", Roles.Wire.BUYER);
        User other = user("9820000106", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        request(host, roomId, doc(other, "Rent agreement")).andExpect(status().is(422));
        request(host, roomId, UUID.randomUUID().toString()).andExpect(status().is(422));
        request(host, roomId, doc(host, "Aadhaar")).andExpect(status().is(422));
        request(host, roomId, doc(host, "Driving licence")).andExpect(status().is(422));
        request(host, roomId, propertyVaultDoc(host)).andExpect(status().is(422));
        assertThat(reviewCount(roomId)).isZero();
        assertThat(roomRow(roomId).get("verification_tier")).isEqualTo("identity");
    }

    @Test
    @DisplayName("refuses an owner-hosted room")
    void ownerRoomRefused() throws Exception {
        User host = user("9820000107", Roles.Wire.BUYER);
        String roomId = postRoom(host, "owner");
        request(host, roomId, doc(host, "Rent agreement")).andExpect(status().isConflict());
        assertThat(reviewCount(roomId)).isZero();
    }

    @Test
    @DisplayName("a rejection shows its reason to the host only, and resubmitting reopens the same review")
    void rejectedThenResubmitted() throws Exception {
        User host = user("9820000108", Roles.Wire.BUYER);
        User ops = user("9820000109", Roles.Wire.STAFF);
        String roomId = postRoom(host, "tenant");
        request(host, roomId, doc(host, "Rent agreement")).andExpect(status().isOk());
        decide(ops, roomId, "{\"decision\":\"rejected\",\"note\":\"Blurry scan\"}", 200);

        mvc.perform(get(Routes.Flatmates.ROOM_BY_ID, roomId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.host.reviewReason").value("Blurry scan"))
                .andExpect(jsonPath("$.item.host.ownerConsentConfirmed").value(false));
        mvc.perform(get(Routes.Flatmates.ROOM_BY_ID, roomId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.host").doesNotExist());

        request(host, roomId, doc(host, "Rent agreement"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.host").doesNotExist());
        assertThat(reviewCount(roomId)).isEqualTo(1);
        assertThat(reviewField(roomId, "status")).isEqualTo("pending");
        assertThat(reviewField(roomId, "reason")).isNull();
        assertThat(roomRow(roomId).get("mod_status")).isEqualTo("approved");
    }

    @Test
    @DisplayName("approval still needs the flat owner's OTP consent")
    void approvalNeedsOwnerConsent() throws Exception {
        User host = user("9820000110", Roles.Wire.BUYER);
        User ops = user("9820000111", Roles.Wire.STAFF);
        String roomId = postRoom(host, "tenant");
        request(host, roomId, doc(host, "Rent agreement")).andExpect(status().isOk());
        assertThat(reviewField(roomId, "owner_consent")).isEqualTo("false");
        decide(ops, roomId, FlatmateApprovals.approve(), 422);

        giveOwnerConsent(host);
        request(host, roomId, doc(host, "Rent agreement")).andExpect(status().isOk());
        assertThat(reviewField(roomId, "owner_consent")).isEqualTo("true");
        decide(ops, roomId, FlatmateApprovals.approve(), 200);
        assertThat(reviewField(roomId, "status")).isEqualTo("approved");
        assertThat(roomRow(roomId).get("verification_tier")).isEqualTo("tenant");
    }

    private static LocalDate today() {
        return LocalDate.now(ZoneId.of("Asia/Kolkata"));
    }

    private static String approveWith(String... checkFields) {
        return "{\"decision\":\"approved\",\"checks\":{" + String.join(",", checkFields) + "}}";
    }

    private static final String NAME_OK = "\"nameMatches\":true";
    private static final String ADDRESS_OK = "\"addressMatches\":true";

    private static String validTill(LocalDate date) {
        return "\"validTill\":\"" + date + "\"";
    }

    private static String issuedOn(LocalDate date) {
        return "\"issuedOn\":\"" + date + "\"";
    }

    private String consentedRequest(User host, String category) throws Exception {
        String roomId = postRoom(host, "tenant");
        giveOwnerConsent(host);
        request(host, roomId, doc(host, category)).andExpect(status().isOk());
        assertThat(reviewField(roomId, "owner_consent")).isEqualTo("true");
        return roomId;
    }

    private String audited(String action, User actor) {
        return jdbc.queryForObject("select count(*)::text from audit_log where action = ? and actor = ?",
                String.class, action, actor.getId().toString());
    }

    @Test
    @DisplayName("a host who has not verified their ID is told to, and nothing is filed")
    void identityRequiredBeforeRequesting() throws Exception {
        User host = user("9820000112", Roles.Wire.BUYER, false);
        String roomId = postRoom(host, "tenant");
        request(host, roomId, doc(host, "Rent agreement"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("identity_required"))
                .andExpect(jsonPath("$.message").value(
                        "Submit your ID verification first, then request the Verified property badge."));
        assertThat(reviewCount(roomId)).isZero();
        assertThat(roomRow(roomId).get("verification_tier")).isEqualTo("identity");
    }

    @Test
    @DisplayName("an ID still in review is enough to file the request, but not to approve it")
    void pendingIdentityMayRequest() throws Exception {
        User host = user("9820000190", Roles.Wire.BUYER, false);
        User ops = user("9820000191", Roles.Wire.STAFF);
        jdbc.update("insert into identity_verifications (user_id, status, doc_type, consent_at, submitted_at)"
                + " values (?, 'pending', 'aadhaar', now(), now())", host.getId());
        String roomId = postRoom(host, "tenant");
        request(host, roomId, doc(host, "Rent agreement")).andExpect(status().isOk());
        assertThat(reviewField(roomId, "status")).isEqualTo("pending");
        giveOwnerConsent(host);
        decide(ops, roomId, FlatmateApprovals.approve(), 422);
    }

    @Test
    @DisplayName("a rent agreement carries the host's agreement period for the reviewer")
    void agreementPeriodIsStored() throws Exception {
        User host = user("9820000192", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        String docId = doc(host, "Rent agreement");
        LocalDate from = LocalDate.now().minusMonths(2);
        LocalDate till = LocalDate.now().plusMonths(9);
        mvc.perform(post(Routes.Flatmates.ROOM_BADGE_REQUEST, roomId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(badgeBody(docId, from, till)))
                .andExpect(status().isOk());
        assertThat(reviewField(roomId, "agreement_doc::jsonb->>'validFrom'")).isEqualTo(from.toString());
        assertThat(reviewField(roomId, "agreement_doc::jsonb->>'validTill'")).isEqualTo(till.toString());
    }

    @Test
    @DisplayName("a rent agreement without a usable period is refused, and nothing is filed")
    void agreementPeriodValidation() throws Exception {
        User host = user("9820000193", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        String docId = doc(host, "Rent agreement");
        LocalDate today = LocalDate.now();
        for (String body : List.of(
                "{\"agreementDoc\":{\"id\":\"%s\"}}".formatted(docId),
                "{\"agreementDoc\":{\"id\":\"%s\",\"validFrom\":\"soon\",\"validTill\":\"%s\"}}"
                        .formatted(docId, today.plusMonths(3)),
                badgeBody(docId, today.plusMonths(2), today.plusMonths(1)),
                badgeBody(docId, today.minusMonths(12), today.minusDays(1)))) {
            mvc.perform(post(Routes.Flatmates.ROOM_BADGE_REQUEST, roomId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(host))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(body))
                    .andExpect(status().is(422));
        }
        assertThat(reviewCount(roomId)).isZero();
    }
    void electricityBillIsEvidence() throws Exception {
        User host = user("9820000113", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        String docId = doc(host, "electricity bill");
        request(host, roomId, docId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.verificationTier").value("tenant"));
        assertThat(reviewField(roomId, "evidence_type")).isEqualTo("electricity_bill");
        assertThat(reviewField(roomId, "agreement_doc::jsonb->>'type'")).isEqualTo("electricity_bill");
        assertThat(reviewField(roomId, "agreement_doc::jsonb->>'id'")).isEqualTo(docId);
    }

    @Test
    @DisplayName("a rent agreement is stored with its type")
    void rentAgreementTypeIsStored() throws Exception {
        User host = user("9820000114", Roles.Wire.BUYER);
        String roomId = postRoom(host, "tenant");
        request(host, roomId, doc(host, "Rent agreement")).andExpect(status().isOk());
        assertThat(reviewField(roomId, "evidence_type")).isEqualTo("rent_agreement");
    }

    private String groupBody(String role) {
        return """
                {"title":"Badge group","locality":"Baner","rent":40000,"deposit":10000,"seats":3,
                 "seatsOpen":1,"name":"Host","role":"%s"}
                """.formatted(role);
    }

    private String postGroup(User host, String role) throws Exception {
        String json = mvc.perform(post(Routes.Flatmates.GROUPS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(groupBody(role)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String id = com.jayway.jsonpath.JsonPath.read(json, "$.id");
        jdbc.update("update flatmate_groups set mod_status = 'approved' where id = ?::uuid", id);
        entityManager.clear();
        return id;
    }

    private org.springframework.test.web.servlet.ResultActions requestGroup(User caller, String groupId,
            String docId) throws Exception {
        return mvc.perform(post(Routes.Flatmates.GROUP_BADGE_REQUEST, groupId)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content(badgeBody(docId)));
    }

    private String groupReview(String groupId, String column) {
        return jdbc.queryForObject("select " + column + "::text from flatmate_reviews where group_id = ?::uuid",
                String.class, groupId);
    }

    @Test
    @DisplayName("a tenant host of a flat-holding group files a pending review and gets the group back")
    void groupBadgeRequest() throws Exception {
        User host = user("9820000115", Roles.Wire.BUYER);
        String groupId = postGroup(host, "tenant");
        requestGroup(host, groupId, doc(host, "Electricity Bill"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(groupId))
                .andExpect(jsonPath("$.verificationTier").value("tenant"));
        assertThat(groupReview(groupId, "status")).isEqualTo("pending");
        assertThat(groupReview(groupId, "evidence_type")).isEqualTo("electricity_bill");
        assertThat(jdbc.queryForObject("select verification_tier from flatmate_groups where id = ?::uuid",
                String.class, groupId)).isEqualTo("tenant");
    }

    @Test
    @DisplayName("a group request is refused for a hunting group, an owner-hosted one and an unverified host")
    void groupBadgeRequestRefusals() throws Exception {
        User host = user("9820000116", Roles.Wire.BUYER);
        User ownerHost = user("9820000140", Roles.Wire.BUYER);
        String hunting = postGroup(host, "tenant");
        jdbc.update("update flatmate_groups set hunting = true where id = ?::uuid", hunting);
        entityManager.clear();
        requestGroup(host, hunting, doc(host, "Rent agreement"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("hunting_group"));

        String owned = postGroup(ownerHost, "owner");
        requestGroup(ownerHost, owned, doc(ownerHost, "Rent agreement"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("not_tenant_hosted"));

        User unverified = user("9820000117", Roles.Wire.BUYER, false);
        String third = postGroup(unverified, "tenant");
        requestGroup(unverified, third, doc(unverified, "Rent agreement"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("identity_required"));

        User stranger = user("9820000118", Roles.Wire.BUYER);
        requestGroup(stranger, third, doc(stranger, "Rent agreement")).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from flatmate_reviews where agreement_doc is not null and group_id in "
                + "(?::uuid, ?::uuid, ?::uuid)", Integer.class, hunting, owned, third)).isZero();
    }

    @Test
    @DisplayName("approving needs both checks true and the document's date")
    void approvalNeedsTheStructuredChecks() throws Exception {
        User host = user("9820000119", Roles.Wire.BUYER);
        User ops = user("9820000120", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Rent agreement");

        decide(ops, roomId, "{\"decision\":\"approved\"}", 422);
        decide(ops, roomId, approveWith(NAME_OK, validTill(today().plusDays(60))), 422);
        decide(ops, roomId, approveWith("\"nameMatches\":false", ADDRESS_OK, validTill(today().plusDays(60))), 422);
        decide(ops, roomId, approveWith(NAME_OK, ADDRESS_OK), 422);
        decide(ops, roomId, approveWith(NAME_OK, ADDRESS_OK, validTill(today())), 422);
        decide(ops, roomId, approveWith(NAME_OK, ADDRESS_OK, validTill(today().minusDays(3))), 422);
        assertThat(reviewField(roomId, "status")).isEqualTo("pending");
    }

    @Test
    @DisplayName("a rent agreement badge runs to the agreement's end, capped at eleven months")
    void agreementBadgeExpiry() throws Exception {
        User shortHost = user("9820000121", Roles.Wire.BUYER);
        User longHost = user("9820000122", Roles.Wire.BUYER);
        User ops = user("9820000123", Roles.Wire.STAFF);

        String shortRoom = consentedRequest(shortHost, "Rent agreement");
        LocalDate endsSoon = today().plusDays(90);
        decide(ops, shortRoom, approveWith(NAME_OK, ADDRESS_OK, validTill(endsSoon)), 200);
        assertThat(reviewField(shortRoom, "agreement_valid_till")).isEqualTo(endsSoon.toString());
        assertThat(reviewField(shortRoom, "name_matches")).isEqualTo("true");
        assertThat(reviewField(shortRoom, "address_matches")).isEqualTo("true");
        assertThat(reviewField(shortRoom, "status")).isEqualTo("approved");

        String longRoom = consentedRequest(longHost, "Rent agreement");
        decide(ops, longRoom, approveWith(NAME_OK, ADDRESS_OK, validTill(today().plusYears(3))), 200);
        assertThat(reviewField(longRoom, "agreement_valid_till"))
                .isEqualTo(today().plusMonths(11).toString());
    }

    @Test
    @DisplayName("a light bill must be dated within 90 days, and then badges for eleven months")
    void lightBillChecks() throws Exception {
        User host = user("9820000124", Roles.Wire.BUYER);
        User ops = user("9820000125", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Electricity Bill");

        decide(ops, roomId, approveWith(NAME_OK, ADDRESS_OK, validTill(today().plusDays(60))), 422);
        decide(ops, roomId, approveWith(NAME_OK, ADDRESS_OK, issuedOn(today().minusDays(91))), 422);
        decide(ops, roomId, approveWith(NAME_OK, ADDRESS_OK, issuedOn(today().plusDays(1))), 422);
        assertThat(reviewField(roomId, "status")).isEqualTo("pending");

        decide(ops, roomId, approveWith(NAME_OK, ADDRESS_OK, issuedOn(today().minusDays(90))), 200);
        assertThat(reviewField(roomId, "evidence_issued_on")).isEqualTo(today().minusDays(90).toString());
        assertThat(reviewField(roomId, "agreement_valid_till")).isEqualTo(today().plusMonths(11).toString());
    }

    @Test
    @DisplayName("approval is refused when the host's ID is no longer verified")
    void approvalNeedsAVerifiedHost() throws Exception {
        User host = user("9820000126", Roles.Wire.BUYER);
        User ops = user("9820000127", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Rent agreement");
        jdbc.update("update users set verified = false where id = ?", host.getId());
        entityManager.clear();

        decide(ops, roomId, FlatmateApprovals.approve(), 422);
        assertThat(reviewField(roomId, "status")).isEqualTo("pending");

        jdbc.update("update users set verified = true where id = ?", host.getId());
        entityManager.clear();
        decide(ops, roomId, FlatmateApprovals.approve(), 200);
    }

    @Test
    @DisplayName("a reviewer gets a signed link to the evidence and each open is audited")
    void reviewerOpensTheDocument() throws Exception {
        User host = user("9820000128", Roles.Wire.BUYER);
        User ops = user("9820000129", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Electricity Bill");
        String reviewId = reviewField(roomId, "id");

        mvc.perform(get(Routes.Moderation.FLATMATE_REVIEW_DOCUMENT_URL, reviewId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ops)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.url").isNotEmpty());
        assertThat(audited("flatmate.review.document.open", ops)).isEqualTo("1");

        mvc.perform(get(Routes.Moderation.FLATMATE_REVIEW_DOCUMENT_URL, reviewId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host)))
                .andExpect(status().isForbidden());
        mvc.perform(get(Routes.Moderation.FLATMATE_REVIEW_DOCUMENT_URL, UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(ops)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the staffer who is a party to the post cannot open its document")
    void partyCannotOpenTheDocument() throws Exception {
        User host = user("9820000130", Roles.Wire.BUYER);
        User ops = user("9820000131", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Rent agreement");
        String reviewId = reviewField(roomId, "id");
        jdbc.update("update flatmate_reviews set host_id = ? where id = ?::uuid", ops.getId(), reviewId);
        jdbc.update("update flatmate_rooms set host_id = ? where id = ?::uuid", ops.getId(), roomId);
        entityManager.clear();

        mvc.perform(get(Routes.Moderation.FLATMATE_REVIEW_DOCUMENT_URL, reviewId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ops)))
                .andExpect(status().isForbidden());
        assertThat(audited("flatmate.review.document.open", ops)).isEqualTo("0");
    }

    @Test
    @DisplayName("a decided review's document closes 30 days after the decision")
    void documentAccessExpires() throws Exception {
        User host = user("9820000132", Roles.Wire.BUYER);
        User ops = user("9820000133", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Rent agreement");
        decide(ops, roomId, FlatmateApprovals.approve(), 200);
        String reviewId = reviewField(roomId, "id");

        mvc.perform(get(Routes.Moderation.FLATMATE_REVIEW_DOCUMENT_URL, reviewId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ops)))
                .andExpect(status().isOk());

        jdbc.execute("alter table flatmate_reviews disable trigger trg_set_updated_at");
        jdbc.update("update flatmate_reviews set updated_at = now() - interval '31 days' where id = ?::uuid",
                reviewId);
        jdbc.execute("alter table flatmate_reviews enable trigger trg_set_updated_at");
        entityManager.clear();
        mvc.perform(get(Routes.Moderation.FLATMATE_REVIEW_DOCUMENT_URL, reviewId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ops)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("document_access_expired"));
    }

    @Test
    @DisplayName("a review with no document has nothing to open")
    void noDocumentIs404() throws Exception {
        User host = user("9820000134", Roles.Wire.BUYER);
        User ops = user("9820000135", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Rent agreement");
        String reviewId = reviewField(roomId, "id");
        jdbc.update("update flatmate_reviews set agreement_doc = null where id = ?::uuid", reviewId);
        entityManager.clear();

        mvc.perform(get(Routes.Moderation.FLATMATE_REVIEW_DOCUMENT_URL, reviewId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(ops)))
                .andExpect(status().isNotFound());
    }

    private org.springframework.test.web.servlet.ResultActions revoke(User staff, String reviewId,
            String body) throws Exception {
        return mvc.perform(post(Routes.Moderation.FLATMATE_REVIEW_REVOKE, reviewId)
                .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    @Test
    @DisplayName("revoking an approved badge rejects the review with the reason and drops the badge")
    void revokeFlow() throws Exception {
        User host = user("9820000136", Roles.Wire.BUYER);
        User ops = user("9820000137", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Rent agreement");
        String reviewId = reviewField(roomId, "id");

        revoke(ops, reviewId, "{\"reason\":\"Too early\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("not_approved"));

        decide(ops, roomId, FlatmateApprovals.approve(), 200);
        revoke(ops, reviewId, "{}").andExpect(status().isUnprocessableEntity());
        revoke(ops, reviewId, "{\"reason\":\"%s\"}".formatted("x".repeat(301)))
                .andExpect(status().isUnprocessableEntity());
        revoke(ops, reviewId, "{\"reason\":\"Agreement was forged\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("rejected"))
                .andExpect(jsonPath("$.reason").value("Agreement was forged"));

        assertThat(reviewField(roomId, "status")).isEqualTo("rejected");
        assertThat(audited("flatmate.review.revoke", ops)).isEqualTo("1");
        mvc.perform(get(Routes.Flatmates.ROOM_BY_ID, roomId).header(HttpHeaders.AUTHORIZATION, bearer(host)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.item.host.reviewReason").value("Agreement was forged"));

        revoke(ops, reviewId, "{\"reason\":\"Again\"}").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("a party to the post cannot revoke its badge")
    void partyCannotRevoke() throws Exception {
        User host = user("9820000138", Roles.Wire.BUYER);
        User ops = user("9820000139", Roles.Wire.STAFF);
        String roomId = consentedRequest(host, "Rent agreement");
        decide(ops, roomId, FlatmateApprovals.approve(), 200);
        String reviewId = reviewField(roomId, "id");
        jdbc.update("update flatmate_reviews set host_id = ? where id = ?::uuid", ops.getId(), reviewId);
        jdbc.update("update flatmate_rooms set host_id = ? where id = ?::uuid", ops.getId(), roomId);
        entityManager.clear();

        revoke(ops, reviewId, "{\"reason\":\"Mine\"}").andExpect(status().isForbidden());
    }
}
