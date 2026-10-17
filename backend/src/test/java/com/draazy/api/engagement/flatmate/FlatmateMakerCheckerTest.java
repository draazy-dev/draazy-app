package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.PersonalDocument;
import com.draazy.api.documents.vault.PersonalDocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.draazy.api.support.UploadedPhotos;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Flatmates maker-checker — nobody checks their own content, nothing hidden leaks")
class FlatmateMakerCheckerTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @Autowired
    PersonalDocumentRepository personalDocuments;

    @Autowired
    PropertyRepository properties;

    @Autowired
    jakarta.persistence.EntityManager em;

    private void sql(String statement, Object... args) {
        em.flush();
        jdbc.update(statement, args);
        em.clear();
    }

    private final List<String> createdActors = new ArrayList<>();

    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        createdActors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
        createdActors.clear();
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("U" + mobile.substring(6));
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        createdActors.add(saved.getId().toString());
        return saved;
    }

    private static String idIn(String json) {
        return json.replaceAll(".*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String createPost(User author) throws Exception {
        return idIn(mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Asha","gender":"any","age":27,"budget":18000,
                                 "localities":["Baner"],"moveIn":"2026-12-01",
                                 "flatPref":"any","roomPref":"private","tags":[],"note":"Quiet."}
                                """))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private String createTenantRoom(User host) throws Exception {
        PersonalDocument doc = personalDocuments.saveAndFlush(new PersonalDocument(host.getId(),
                "Registered Leave and Licence", "leave-and-licence.pdf",
                "personal/" + host.getId() + "/" + UUID.randomUUID(), 184320L, "application/pdf"));
        String body = """
                {"bhk":"2","roomType":"Private room","attachedBath":"attached","furnishing":"semi",
                 "locality":"Baner","society":"Maker Checker Heights","rentShare":15000,"deposit":30000,
                 "availableFrom":"2026-12-01","lookingFor":"any","foodPref":"any",
                 "agreementDeclared":true,"photos":["%s"],"note":"Sunny room.",%s}
                """.formatted(UploadedPhotos.of(host.getId()), FlatmateAgreementFixture.EVIDENCE)
                .replace("\"id\":\"agr-doc-1\"", "\"id\":\"" + doc.getId() + "\"");
        return idIn(mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private UUID reviewOf(String roomId) {
        return jdbc.queryForObject("select id from flatmate_reviews where room_id = ?::uuid",
                UUID.class, roomId);
    }

    private org.springframework.test.web.servlet.ResultActions moderate(User mod, String id,
            String state, String note) throws Exception {
        String body = note == null ? "{\"modStatus\":\"%s\"}".formatted(state)
                : "{\"modStatus\":\"%s\",\"note\":\"%s\"}".formatted(state, note);
        return mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(mod))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private org.springframework.test.web.servlet.ResultActions decide(User mod, UUID reviewId,
            String decision, String note) throws Exception {
        return mvc.perform(patch(Routes.Moderation.FLATMATE_REVIEW_BY_ID, reviewId)
                .header(HttpHeaders.AUTHORIZATION, bearer(mod))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"%s\",\"note\":\"%s\"}".formatted(decision, note)));
    }

    @Test
    @DisplayName("a staff account cannot post flatmate supply at all")
    void staffCannotAuthor() throws Exception {
        User staff = user("9300000001", Roles.Wire.STAFF);
        mvc.perform(post(Routes.Flatmates.POSTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"name":"Asha","gender":"any","age":27,"budget":18000,
                                 "localities":["Baner"],"moveIn":"2026-12-01",
                                 "flatPref":"any","roomPref":"private","tags":[],"note":"Quiet."}
                                """))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a moderator cannot moderate a post they authored")
    void noSelfModeration() throws Exception {
        User seeker = user("9300000002", Roles.Wire.BUYER);
        User staff = user("9300000003", Roles.Wire.STAFF);
        String postId = createPost(seeker);
        sql("update flatmate_seeker_posts set user_id = ? where id = ?::uuid", staff.getId(), postId);

        moderate(staff, postId, "approved", null).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a moderator cannot edit-as-moderator a post they authored")
    void noSelfModeratorEdit() throws Exception {
        User seeker = user("9300000004", Roles.Wire.BUYER);
        User staff = user("9300000005", Roles.Wire.STAFF);
        String postId = createPost(seeker);
        sql("update flatmate_seeker_posts set user_id = ? where id = ?::uuid", staff.getId(), postId);

        mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION_DETAIL, postId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Edited by me\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a reviewer cannot decide the badge review of their own post")
    void noSelfBadge() throws Exception {
        User host = user("9300000006", Roles.Wire.BUYER);
        User staff = user("9300000007", Roles.Wire.STAFF);
        String roomId = createTenantRoom(host);
        UUID reviewId = reviewOf(roomId);
        sql("update flatmate_reviews set host_id = ?, owner_consent = true where id = ?", staff.getId(), reviewId);
        sql("update flatmate_rooms set host_id = ? where id = ?::uuid", staff.getId(), roomId);

        decide(staff, reviewId, "approved", "ok").andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a decided badge review cannot be silently re-decided")
    void noReDecide() throws Exception {
        User host = user("9300000008", Roles.Wire.BUYER);
        User staff = user("9300000009", Roles.Wire.STAFF);
        String roomId = createTenantRoom(host);
        UUID reviewId = reviewOf(roomId);
        sql("update flatmate_reviews set owner_consent = true where id = ?", reviewId);

        decide(staff, reviewId, "approved", "ok").andExpect(status().isOk());
        decide(staff, reviewId, "rejected", "changed my mind").andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("select verification_tier from flatmate_rooms where id = ?::uuid",
                String.class, roomId)).isEqualTo("tenant");
    }

    @Test
    @DisplayName("a pending item cannot be saved, and a saved item that is pulled stops rendering")
    void savesShowOnlyPublic() throws Exception {
        User host = user("9300000010", Roles.Wire.BUYER);
        User seeker = user("9300000011", Roles.Wire.BUYER);
        User staff = user("9300000012", Roles.Wire.STAFF);
        String pendingRoom = createTenantRoom(host);
        assertThat(jdbc.queryForObject("select mod_status from flatmate_rooms where id = ?::uuid",
                String.class, pendingRoom)).isEqualTo("pending");

        mvc.perform(put(Routes.Engagement.FLATMATE_SAVE_BY_ID, "room", pendingRoom)
                        .header(HttpHeaders.AUTHORIZATION, bearer(seeker)))
                .andExpect(status().isNotFound());

        String postId = createPost(host);
        mvc.perform(put(Routes.Engagement.FLATMATE_SAVE_BY_ID, "post", postId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(seeker)))
                .andExpect(status().is2xxSuccessful());
        moderate(staff, postId, "removed", "spam").andExpect(status().isOk());

        String saved = mvc.perform(get(Routes.Engagement.FLATMATE_SAVES)
                        .header(HttpHeaders.AUTHORIZATION, bearer(seeker)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(saved).doesNotContain(postId);
    }

    @Test
    @DisplayName("an erased author's live post leaves every public read")
    void erasedAuthorHidden() throws Exception {
        User seeker = user("9300000013", Roles.Wire.BUYER);
        String postId = createPost(seeker);
        sql("update users set status = 'archived', archived = true where id = ?", seeker.getId());

        mvc.perform(get(Routes.Flatmates.POST_BY_ID, postId)).andExpect(status().isNotFound());
    }

    private int notificationsFor(User u) {
        return jdbc.queryForObject("select count(*) from notifications where user_id = ?",
                Integer.class, u.getId());
    }

    @Test
    @DisplayName("hiding and un-hiding need a note; re-stamping the same state is a silent no-op")
    void ladderNeedsNotes() throws Exception {
        User seeker = user("9300000014", Roles.Wire.BUYER);
        User staff = user("9300000015", Roles.Wire.STAFF);
        String postId = createPost(seeker);

        moderate(staff, postId, "removed", null).andExpect(status().isBadRequest());
        moderate(staff, postId, "removed", "Spam").andExpect(status().isOk());
        moderate(staff, postId, "approved", null).andExpect(status().isBadRequest());
        moderate(staff, postId, "approved", "Appeal upheld").andExpect(status().isOk());
        int before = notificationsFor(seeker);
        moderate(staff, postId, "approved", null).andExpect(status().isOk());
        assertThat(notificationsFor(seeker)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where actor = ? and entity_id = ?",
                Integer.class, staff.getId().toString(), postId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("select metadata::text from audit_log where actor = ? and entity_id = ? "
                        + "order by at desc limit 1", String.class, staff.getId().toString(), postId))
                .contains("\"from\": \"removed\"").contains("Appeal upheld");
    }

    @Test
    @DisplayName("a removal tells the author what to do, never the internal note")
    void removalCopy() throws Exception {
        User seeker = user("9300000016", Roles.Wire.BUYER);
        User staff = user("9300000017", Roles.Wire.STAFF);
        String postId = createPost(seeker);
        moderate(staff, postId, "removed", "Internal: repeat spammer").andExpect(status().isOk());

        assertThat(jdbc.queryForObject("select body from notifications where user_id = ? "
                        + "order by created_at desc limit 1", String.class, seeker.getId()))
                .isEqualTo("It did not pass our review. Edit it to follow our posting rules, "
                        + "or contact support from Help.");
    }

    @Test
    @DisplayName("the expiry clock restarts only when a verdict publishes the item")
    void expiryRestartsOnlyOnPublish() throws Exception {
        User seeker = user("9300000018", Roles.Wire.BUYER);
        User staff = user("9300000019", Roles.Wire.STAFF);
        String postId = createPost(seeker);
        sql("update flatmate_seeker_posts set active_until = '2027-01-01T00:00:00Z' where id = ?::uuid", postId);

        moderate(staff, postId, "flagged", "Check photos").andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select active_until::date::text from flatmate_seeker_posts "
                + "where id = ?::uuid", String.class, postId)).isEqualTo("2027-01-01");
        moderate(staff, postId, "approved", null).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select active_until::date::text from flatmate_seeker_posts "
                + "where id = ?::uuid", String.class, postId)).isNotEqualTo("2027-01-01");
    }

    @Test
    @DisplayName("an expired item is filterable and counted hidden, but only the host's renewal revives it")
    void expiredIsReadOnlyOnTheDesk() throws Exception {
        User seeker = user("9300000020", Roles.Wire.BUYER);
        User staff = user("9300000021", Roles.Wire.STAFF);
        String postId = createPost(seeker);
        sql("update flatmate_seeker_posts set mod_status = 'expired' where id = ?::uuid", postId);

        moderate(staff, postId, "approved", null).andExpect(status().isConflict());
        assertThat(mvc.perform(get(Routes.Moderation.FLATMATE_MODERATION_QUEUE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .param("kind", "post").param("modStatus", "expired").param("size", "100"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .contains(postId);
    }

    @Test
    @DisplayName("a moderator cannot moderate an application they made or one to their own flat")
    void noSelfApplicationModeration() throws Exception {
        User owner = user("9300000022", Roles.Wire.OWNER);
        User host = user("9300000023", Roles.Wire.BUYER);
        User staff = user("9300000024", Roles.Wire.STAFF);
        String applicationId = application(owner, host);
        sql("update flatmate_group_applications set applicant_id = ? where id = ?::uuid", staff.getId(),
                applicationId);

        moderateApplication(staff, applicationId, "removed", "Mine").andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("an owner cannot accept or decline an application staff took down")
    void takenDownApplicationIsFrozen() throws Exception {
        User owner = user("9300000025", Roles.Wire.OWNER);
        User host = user("9300000026", Roles.Wire.BUYER);
        User staff = user("9300000027", Roles.Wire.STAFF);
        String applicationId = application(owner, host);
        moderateApplication(staff, applicationId, "removed", "Fake group").andExpect(status().isOk());

        for (String decision : List.of("accepted", "declined")) {
            mvc.perform(patch(Routes.Flatmates.MY_GROUP_APPLICATION_BY_ID, applicationId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"" + decision + "\"}"))
                    .andExpect(status().isConflict());
        }
    }

    @Test
    @DisplayName("a host cannot accept a request on an ad staff hid, but can still decline it")
    void hiddenAdCannotAccept() throws Exception {
        User host = user("9300000028", Roles.Wire.BUYER);
        User asker = user("9300000029", Roles.Wire.BUYER);
        User staff = user("9300000030", Roles.Wire.STAFF);
        String groupId = womenGroup(host);
        String requestId = join(groupId, asker, "female");
        moderate(staff, groupId, "flagged", "Check title").andExpect(status().isOk());

        decideRequest(host, requestId, "accepted").andExpect(status().isConflict());
        decideRequest(host, requestId, "declined").andExpect(status().isOk());
    }

    @Test
    @DisplayName("acceptance re-runs the gender gate against the requester's profile gender")
    void genderGateAtAccept() throws Exception {
        User host = user("9300000031", Roles.Wire.BUYER);
        User asker = user("9300000032", Roles.Wire.BUYER);
        String groupId = womenGroup(host);
        String requestId = join(groupId, asker, "female");
        sql("update users set gender = 'male' where id = ?", asker.getId());

        decideRequest(host, requestId, "accepted").andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("an ask may not carry a phone number")
    void askRefusesContactDetails() throws Exception {
        User host = user("9300000033", Roles.Wire.BUYER);
        User asker = user("9300000034", Roles.Wire.BUYER);
        String groupId = womenGroup(host);
        mvc.perform(post(Routes.Flatmates.GROUP_JOIN, groupId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(asker))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"share\":\"solo\",\"gender\":\"female\",\"message\":\"Call me on 98765 43210\"}"))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("an address or locality field may not carry contact details either")
    void addressFieldsRefuseContactDetails() throws Exception {
        User host = user("9300000039", Roles.Wire.BUYER);
        String base = "\"roomType\":\"Private room\",\"rentShare\":15000";
        for (String fields : List.of(
                "\"locality\":\"Baner\",\"society\":\"Call 98765 43210\"",
                "\"locality\":\"Baner\",\"flatNumber\":\"98765 43210\"",
                "\"locality\":\"Baner\",\"facing\":\"wa.me/919876543210\"",
                "\"locality\":\"Baner\",\"overlooking\":\"a@b.co\"",
                "\"locality\":\"Baner 98765 43210\"",
                "\"locality\":\"Baner\",\"details\":{\"tower\":\"98765 43210\"}",
                "\"locality\":\"Baner\",\"details\":{\"furniture\":[\"Bed, call 9876543210\"]}")) {
            refused(Routes.Flatmates.ROOMS, host, "{" + base + "," + fields + "}");
        }
        refused(Routes.Flatmates.GROUPS, host, """
                {"title":"Two of us","locality":"wa.me/919876543210","policy":"any","rent":40000,
                 "seats":3,"seatsOpen":2,"name":"Host"}""");
        refused(Routes.Flatmates.GROUPS, host, """
                {"title":"Two of us","policy":"any","seats":3,"seatsOpen":2,"name":"Host",
                 "preferences":{"localities":["Baner 98765 43210"],"rentMax":40000,"gatedOnly":false,"bachelors":false}}""");
        refused(Routes.Flatmates.POSTS, host, """
                {"name":"Asha","budget":18000,"localities":["Baner 98765 43210"]}""");
    }

    private void refused(String route, User author, String body) throws Exception {
        assertThat(mvc.perform(post(route).header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isUnprocessableEntity())
                .andReturn().getResponse().getContentAsString())
                .as(body).contains("People reach you through Draazy");
    }

    @Test
    @DisplayName("a stranger's id on an owner-scoped write is a 404")
    void strangerWritesAre404() throws Exception {
        User seeker = user("9300000035", Roles.Wire.BUYER);
        User stranger = user("9300000036", Roles.Wire.BUYER);
        String postId = createPost(seeker);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete(Routes.Flatmates.POST_BY_ID, postId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
        String groupId = womenGroup(seeker);
        mvc.perform(patch(Routes.Flatmates.GROUP_SEATS, groupId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"seatsOpen\":0}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the moderator edit audit carries the before and after values")
    void moderatorEditAuditsValues() throws Exception {
        User seeker = user("9300000037", Roles.Wire.BUYER);
        User staff = user("9300000038", Roles.Wire.STAFF);
        String postId = createPost(seeker);
        mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION_DETAIL, postId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Tidied.\"}"))
                .andExpect(status().is2xxSuccessful());
        assertThat(jdbc.queryForObject("select metadata::text from audit_log where actor = ? and entity_id = ?",
                String.class, staff.getId().toString(), postId))
                .contains("\"note\": \"Quiet.\"").contains("\"note\": \"Tidied.\"");
    }

    @Test
    @DisplayName("a group member is a party to the group, and staff cannot join or ask at all")
    void groupMembersAreParties() throws Exception {
        User host = user("9300000040", Roles.Wire.BUYER);
        User member = user("9300000041", Roles.Wire.BUYER);
        User staff = user("9300000042", Roles.Wire.STAFF);
        String groupId = womenGroup(host);
        decideRequest(host, join(groupId, member, "female"), "accepted").andExpect(status().isOk());
        sql("update flatmate_group_members set user_id = ? where group_id = ?::uuid and user_id = ?",
                staff.getId(), groupId, member.getId());

        moderate(staff, groupId, "flagged", "Mine").andExpect(status().isForbidden());
        mvc.perform(patch(Routes.Moderation.FLATMATE_MODERATION_DETAIL, groupId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"note\":\"Edited by me\"}"))
                .andExpect(status().isForbidden());
        String anyId = UUID.randomUUID().toString();
        for (String route : List.of(Routes.Flatmates.GROUP_JOIN, Routes.Flatmates.ROOM_INTEREST,
                Routes.Flatmates.POST_INTEREST)) {
            mvc.perform(post(route, anyId).header(HttpHeaders.AUTHORIZATION, bearer(staff))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"share\":\"solo\"}"))
                    .andExpect(status().isForbidden());
        }
    }

    @Test
    @DisplayName("a seeker's move-in text and a split room's note may not carry contact details")
    void freeTextThatGoesPublicRefusesContactDetails() throws Exception {
        User seeker = user("9300000043", Roles.Wire.BUYER);
        refused(Routes.Flatmates.POSTS, seeker, """
                {"name":"Asha","budget":18000,"localities":["Baner"],"moveIn":"WA 98765 43210"}""");
        refused(Routes.Properties.SPLIT.replace("{id}", UUID.randomUUID().toString()), seeker, """
                {"maxOccupants":3,"rooms":[{"roomKind":"master","rent":10000,"note":"call 9876543210"}]}""");
    }

    @Test
    @DisplayName("a staff account cannot split a flat into flatmate rooms")
    void staffCannotSplit() throws Exception {
        User staff = user("9300000044", Roles.Wire.STAFF);
        String route = Routes.Properties.SPLIT.replace("{id}", UUID.randomUUID().toString());
        mvc.perform(post(route).header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"maxOccupants\":3,\"rooms\":[{\"roomKind\":\"master\",\"rent\":10000}]}"))
                .andExpect(status().isForbidden());
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete(route)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a suspended account (archived, status still active) drops out of public reads")
    void archivedAuthorHidden() throws Exception {
        User seeker = user("9300000045", Roles.Wire.BUYER);
        User saver = user("9300000046", Roles.Wire.BUYER);
        String postId = createPost(seeker);
        sql("update users set archived = true where id = ?", seeker.getId());

        mvc.perform(get(Routes.Flatmates.POST_BY_ID, postId)).andExpect(status().isNotFound());
        mvc.perform(put(Routes.Engagement.FLATMATE_SAVE_BY_ID, "post", postId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(saver)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an ask on a seeker post the author deleted cannot be accepted")
    void deletedPostCannotAccept() throws Exception {
        User seeker = user("9300000047", Roles.Wire.BUYER);
        User host = user("9300000048", Roles.Wire.BUYER);
        String postId = createPost(seeker);
        mvc.perform(post(Routes.Flatmates.POST_INTEREST, postId).header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"share\":\"solo\"}"))
                .andExpect(status().isCreated());
        String requestId = jdbc.queryForObject("select id::text from flatmate_requests where target_id = ?::uuid",
                String.class, postId);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete(Routes.Flatmates.POST_BY_ID, postId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(seeker)))
                .andExpect(status().is2xxSuccessful());

        decideRequest(seeker, requestId, "accepted").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("a takedown of an expired item sticks through the host's renewal")
    void takedownOfExpiredSticks() throws Exception {
        User seeker = user("9300000049", Roles.Wire.BUYER);
        User staff = user("9300000050", Roles.Wire.STAFF);
        String postId = createPost(seeker);
        sql("update flatmate_seeker_posts set mod_status = 'expired', expired_from = 'approved' "
                + "where id = ?::uuid", postId);

        moderate(staff, postId, "removed", "Reported: scam").andExpect(status().isOk());
        mvc.perform(post(Routes.Flatmates.RENEW, "post", postId).header(HttpHeaders.AUTHORIZATION, bearer(seeker)))
                .andExpect(status().is2xxSuccessful());
        assertThat(jdbc.queryForObject("select mod_status from flatmate_seeker_posts where id = ?::uuid",
                String.class, postId)).isEqualTo("removed");
    }

    @Test
    @DisplayName("restoring a taken-down accepted application cannot give a flat a second accepted group")
    void restoreKeepsOneAcceptedGroup() throws Exception {
        User owner = user("9300000051", Roles.Wire.OWNER);
        User first = user("9300000052", Roles.Wire.BUYER);
        User second = user("9300000053", Roles.Wire.BUYER);
        User staff = user("9300000054", Roles.Wire.STAFF);
        UUID listing = flat(owner);
        String a = apply(first, listing);
        decideApplication(owner, a, "accepted").andExpect(status().isOk());
        moderateApplication(staff, a, "removed", "Fake group").andExpect(status().isOk());
        String b = apply(second, listing);
        decideApplication(owner, b, "accepted").andExpect(status().isOk());

        moderateApplication(staff, a, "live", "Was genuine").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("an owner cannot accept an application from a group that is gone")
    void goneGroupCannotBeAccepted() throws Exception {
        User owner = user("9300000055", Roles.Wire.OWNER);
        User host = user("9300000056", Roles.Wire.BUYER);
        String applicationId = application(owner, host);
        sql("update flatmate_groups set archived = true where id = (select group_id from "
                + "flatmate_group_applications where id = ?::uuid)", applicationId);

        decideApplication(owner, applicationId, "accepted").andExpect(status().isConflict());
        decideApplication(owner, applicationId, "declined").andExpect(status().isOk());
    }

    @Test
    @DisplayName("an owner cannot accept an application from a suspended host's group")
    void suspendedHostsGroupCannotBeAccepted() throws Exception {
        User owner = user("9300000057", Roles.Wire.OWNER);
        User host = user("9300000058", Roles.Wire.BUYER);
        String applicationId = application(owner, host);
        sql("update users set status = 'suspended' where id = ?", host.getId());

        decideApplication(owner, applicationId, "accepted").andExpect(status().isConflict());
    }

    @Test
    @DisplayName("staff cannot restore an accepted application whose group is gone")
    void restoreNeedsALiveGroup() throws Exception {
        User owner = user("9300000059", Roles.Wire.OWNER);
        User host = user("9300000060", Roles.Wire.BUYER);
        User staff = user("9300000061", Roles.Wire.STAFF);
        String applicationId = application(owner, host);
        decideApplication(owner, applicationId, "accepted").andExpect(status().isOk());
        moderateApplication(staff, applicationId, "removed", "Fake group").andExpect(status().isOk());
        sql("update flatmate_groups set archived = true where id = (select group_id from "
                + "flatmate_group_applications where id = ?::uuid)", applicationId);

        moderateApplication(staff, applicationId, "live", "Was genuine").andExpect(status().isConflict());
    }

    private org.springframework.test.web.servlet.ResultActions moderateApplication(User mod, String id,
            String state, String note) throws Exception {
        return mvc.perform(patch(Routes.Moderation.GROUP_APPLICATION_BY_ID, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(mod))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"modStatus\":\"%s\",\"note\":\"%s\"}".formatted(state, note)));
    }

    private org.springframework.test.web.servlet.ResultActions decideRequest(User host, String requestId,
            String decision) throws Exception {
        return mvc.perform(patch(Routes.Flatmates.MY_REQUEST_BY_ID, requestId)
                .header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"decision\":\"" + decision + "\"}"));
    }

    private String womenGroup(User host) throws Exception {
        String id = idIn(mvc.perform(post(Routes.Flatmates.GROUPS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Two of us in Aundh","locality":"Aundh","policy":"women",
                                 "rent":40000,"seats":3,"seatsOpen":2,"name":"Host"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        sql("update flatmate_groups set mod_status = 'approved' where id = ?::uuid", id);
        return id;
    }

    private String join(String groupId, User asker, String gender) throws Exception {
        mvc.perform(post(Routes.Flatmates.GROUP_JOIN, groupId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(asker))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"share\":\"solo\",\"gender\":\"" + gender + "\"}"))
                .andExpect(status().isCreated());
        return jdbc.queryForObject("select id::text from flatmate_requests where target_id = ?::uuid "
                + "and requester_id = ?", String.class, groupId, asker.getId());
    }

    private String application(User owner, User host) throws Exception {
        return apply(host, flat(owner));
    }

    private UUID flat(User owner) {
        Property flat = new Property(owner, "3BHK in Kothrud", "rent", "apartment", 45000L, "Kothrud", "Pune");
        flat.setBhk(new BigDecimal("3"));
        flat.setStatus("approved");
        flat.setPriceUnit("per-month");
        flat.setArea(new BigDecimal("1100"));
        return properties.saveAndFlush(flat).getId();
    }

    private String apply(User host, UUID listingId) throws Exception {
        String groupId = idIn(mvc.perform(post(Routes.Flatmates.GROUPS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title":"Three of us","locality":"Kothrud","policy":"any","rent":45000,
                                 "seats":3,"seatsOpen":1,"name":"Host"}
                                """))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
        sql("update flatmate_groups set mod_status = 'approved' where id = ?::uuid", groupId);
        return idIn(mvc.perform(post(Routes.Flatmates.GROUP_APPLY.replace("{id}", groupId))
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":\"" + listingId + "\"}"))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString());
    }

    private org.springframework.test.web.servlet.ResultActions decideApplication(User owner, String id,
            String decision) throws Exception {
        return mvc.perform(patch(Routes.Flatmates.MY_GROUP_APPLICATION_BY_ID, id)
                .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"status\":\"" + decision + "\"}"));
    }
}
