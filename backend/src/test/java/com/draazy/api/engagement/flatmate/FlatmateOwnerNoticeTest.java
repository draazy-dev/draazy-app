package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.auth.Tokens;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@DisplayName("Flatmates — the owner's WhatsApp notice, and the rules that feed it")
class FlatmateOwnerNoticeTest extends AbstractApiTest {

    private static final String TOKEN_HEADER = "X-Owner-Notice-Token";
    private static final String OWNER = "9815660900";

    @Autowired
    UserRepository users;

    @PersistenceContext
    EntityManager em;

    @MockitoBean
    DecisionMessenger messenger;

    private static JdbcTemplate cleanup;

    private final Set<TransactionSynchronization> fired = Collections.newSetFromMap(new IdentityHashMap<>());

    @BeforeEach
    void lendTemplateToTheStaticTeardown() {
        cleanup = jdbc;
    }

    // Audit rows commit in their own transaction, so the test rollback cannot take them back.
    @AfterAll
    static void removeAuditRowsThatEscapedRollback() {
        cleanup.update("delete from audit_log where actor = 'owner-link'");
    }

    private User user(String mobile, String name) {
        User u = new User(mobile, Roles.Wire.BUYER);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String roomBody(User host, String role, String ownerMobile, String depositField) {
        String consent = "tenant".equals(role)
                ? ",\"ownerConsent\":true" + (ownerMobile == null ? "" : ",\"ownerConsentMobile\":\"" + ownerMobile + "\"")
                : "";
        return withSocietyIds("""
                {"bhk":"2","roomType":"Private room","attachedBath":"attached",
                 "locality":"Baner","society":"Notice Heights","rentShare":15000,
                 %s"availableFrom":"2026-09-01","lookingFor":"any","foodPref":"any",
                 %s,"hostRole":"%s"%s,"note":"Sunny room, quiet building.",%s,%s}
                """.formatted(depositField, FlatmateRoomFixture.photos(host.getId()), role, consent,
                FlatmateRoomFixture.BASICS, FlatmateRoomFixture.DETAILS));
    }

    private String roomBody(User host, String role, String ownerMobile) {
        return roomBody(host, role, ownerMobile, "\"deposit\":30000,");
    }

    private ResultActions postRoom(User host, String body) throws Exception {
        return mvc.perform(post(Routes.Flatmates.ROOMS)
                .header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private String idOf(ResultActions result) throws Exception {
        String json = result.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return json.replaceAll("(?s).*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    // The test transaction never commits, so the after-commit send is driven by hand.
    private void commit() {
        for (TransactionSynchronization s : TransactionSynchronizationManager.getSynchronizations()) {
            if (fired.add(s)) {
                s.afterCommit();
            }
        }
    }

    private String tenantRoomWithNotice(User host, String ownerMobile) throws Exception {
        String id = idOf(postRoom(host, roomBody(host, "tenant", ownerMobile)));
        commit();
        return id;
    }

    private String linkSentTo(String mobile) {
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(messenger).sendOwnerNotice(eq(mobile), any(), any(), link.capture());
        return link.getValue();
    }

    private static String tokenOf(String link) {
        return link.substring(link.indexOf('#') + 1);
    }

    private ResultActions view(String token) throws Exception {
        return mvc.perform(get(Routes.Flatmates.OWNER_NOTICE).header(TOKEN_HEADER, token));
    }

    private ResultActions answer(String token, String answer) throws Exception {
        return mvc.perform(post(Routes.Flatmates.OWNER_NOTICE_ANSWER).header(TOKEN_HEADER, token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"answer\":\"" + answer + "\"}"));
    }

    private int noticeRows(String roomId) {
        return jdbc.queryForObject("select count(*) from flatmate_owner_notices where room_id = ?::uuid",
                Integer.class, roomId);
    }

    private void insertNotice(String roomId, UUID hostId, String ownerMobile) {
        jdbc.update("""
                insert into flatmate_owner_notices (room_id, host_id, owner_mobile, address_fingerprint,
                    token_hash, expires_at)
                values (?::uuid, ?, ?, 'filler', ?, now() + interval '30 days')
                """, roomId, hostId, ownerMobile, UUID.randomUUID().toString());
    }

    @Test
    @DisplayName("a tenant room naming the owner WhatsApps them a link whose token is stored only as a hash")
    void tenantPostSendsTheNotice() throws Exception {
        User host = user("9815660001", "Asha Rao");
        String roomId = tenantRoomWithNotice(host, OWNER);

        String link = linkSentTo(OWNER);
        verify(messenger).sendOwnerNotice(eq(OWNER), eq("Asha"), eq("Notice Heights, Baner"), any());
        assertThat(link).startsWith("http://localhost:5173/owner-confirm#");
        assertThat(noticeRows(roomId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices where token_hash = ?",
                Integer.class, Tokens.sha256Hex(tokenOf(link)))).isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices where token_hash = ?",
                Integer.class, tokenOf(link))).isZero();
    }

    @Test
    @DisplayName("nothing is sent before the post commits")
    void aRolledBackPostSendsNothing() throws Exception {
        User host = user("9815660002", "Asha Rao");
        postRoom(host, roomBody(host, "tenant", OWNER)).andExpect(status().isCreated());

        verify(messenger, never()).sendOwnerNotice(any(), any(), any(), any());
    }

    @Test
    @DisplayName("an owner-hosted room sends no notice")
    void ownerRoomSendsNothing() throws Exception {
        User host = user("9815660003", "Own Er");
        String roomId = idOf(postRoom(host, roomBody(host, "owner", null)));
        commit();

        assertThat(noticeRows(roomId)).isZero();
        verify(messenger, never()).sendOwnerNotice(any(), any(), any(), any());
    }

    @Test
    @DisplayName("the link shows the tenant's first name and the room, never a mobile")
    void viewCarriesNoContact() throws Exception {
        User host = user("9815660004", "Asha Rao");
        tenantRoomWithNotice(host, OWNER);

        String body = view(tokenOf(linkSentTo(OWNER))).andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantName").value("Asha"))
                .andExpect(jsonPath("$.society").value("Notice Heights"))
                .andExpect(jsonPath("$.locality").value("Baner"))
                .andExpect(jsonPath("$.rent").value(15000))
                .andExpect(jsonPath("$.status").value("sent"))
                .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain(OWNER).doesNotContain(host.getMobile()).doesNotContain("Rao");
    }

    @Test
    @DisplayName("agreeing grants consent on the room, once, and says so on a repeat")
    void agreeGrantsConsent() throws Exception {
        User host = user("9815660005", "Asha Rao");
        String roomId = tenantRoomWithNotice(host, OWNER);
        String token = tokenOf(linkSentTo(OWNER));

        answer(token, "agree").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("agreed"));
        answer(token, "agree").andExpect(status().isOk()).andExpect(jsonPath("$.status").value("agreed"));

        em.clear();
        assertThat(jdbc.queryForObject("select owner_consent from flatmate_rooms where id = ?::uuid",
                Boolean.class, roomId)).isTrue();
        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_consents where granted_by = ?::uuid",
                Integer.class, host.getId().toString())).isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                select count(*) from audit_log where actor = 'owner-link' and action = 'flatmate.ownerNotice.agreed'
                    and entity_id = ?
                """, Integer.class, roomId)).isEqualTo(1);
        view(token).andExpect(jsonPath("$.status").value("agreed"));
    }

    @Test
    @DisplayName("declining pulls a live room back to the queue, flagged with the owner's reason")
    void declineHoldsTheRoomForOps() throws Exception {
        User host = user("9815660006", "Asha Rao");
        String roomId = tenantRoomWithNotice(host, OWNER);
        jdbc.update("update flatmate_rooms set mod_status = 'approved' where id = ?::uuid", roomId);
        em.clear();

        answer(tokenOf(linkSentTo(OWNER)), "decline").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("declined"));

        em.clear();
        assertThat(jdbc.queryForMap("select mod_status, flag_for_review, owner_consent from flatmate_rooms"
                + " where id = ?::uuid", roomId))
                .containsEntry("mod_status", "pending").containsEntry("flag_for_review", true)
                .containsEntry("owner_consent", false);
        assertThat(jdbc.queryForMap("select status, reason, flag_for_review from flatmate_reviews"
                + " where room_id = ?::uuid", roomId))
                .containsEntry("status", "pending").containsEntry("reason", "Owner said no on WhatsApp")
                .containsEntry("flag_for_review", true);
        assertThat(jdbc.queryForObject("""
                select count(*) from audit_log where actor = 'owner-link' and action = 'flatmate.ownerNotice.declined'
                    and entity_id = ?
                """, Integer.class, roomId)).isEqualTo(1);
    }

    @Test
    @DisplayName("a different answer after one is recorded is a 409; the first stands")
    void aSecondDifferentAnswerIsRefused() throws Exception {
        User host = user("9815660007", "Asha Rao");
        tenantRoomWithNotice(host, OWNER);
        String token = tokenOf(linkSentTo(OWNER));

        answer(token, "decline").andExpect(status().isOk());
        answer(token, "agree").andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("You've already answered."));
        view(token).andExpect(jsonPath("$.status").value("declined"));
    }

    @Test
    @DisplayName("an unknown, missing, expired or archived-room link is the same plain 404")
    void deadLinksAreNotFound() throws Exception {
        User host = user("9815660008", "Asha Rao");
        String roomId = tenantRoomWithNotice(host, OWNER);
        String token = tokenOf(linkSentTo(OWNER));

        view("not-a-real-token").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("This link is no longer valid."));
        mvc.perform(get(Routes.Flatmates.OWNER_NOTICE)).andExpect(status().isNotFound());
        answer("not-a-real-token", "agree").andExpect(status().isNotFound());

        jdbc.update("update flatmate_owner_notices set expires_at = now() - interval '1 minute'");
        em.clear();
        view(token).andExpect(status().isNotFound());
        answer(token, "agree").andExpect(status().isNotFound());

        jdbc.update("update flatmate_owner_notices set expires_at = now() + interval '1 day'");
        jdbc.update("update flatmate_rooms set archived = true where id = ?::uuid", roomId);
        em.clear();
        view(token).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("an answer other than agree or decline is a 422")
    void anInvalidAnswerIsRefused() throws Exception {
        User host = user("9815660009", "Asha Rao");
        tenantRoomWithNotice(host, OWNER);

        answer(tokenOf(linkSentTo(OWNER)), "maybe").andExpect(status().isUnprocessableEntity());
    }

    @Test
    @DisplayName("the owner's number is required for a tenant room, and may not be the caller's own")
    void tenantRoomNeedsAnotherPersonsNumber() throws Exception {
        User host = user("9815660010", "Asha Rao");

        postRoom(host, roomBody(host, "tenant", null)).andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.message")
                        .value("ownerConsentMobile is required for a tenant-hosted flatmate room."));
        postRoom(host, roomBody(host, "tenant", "   ")).andExpect(status().isUnprocessableEntity());
        postRoom(host, roomBody(host, "tenant", host.getMobile())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("owner_consent_self"));
    }

    @Test
    @DisplayName("editing the owner's number sends the new owner a notice and voids the old link")
    void anEditedNumberGetsItsOwnNotice() throws Exception {
        User host = user("9815660011", "Asha Rao");
        String roomId = tenantRoomWithNotice(host, OWNER);
        String oldToken = tokenOf(linkSentTo(OWNER));

        String other = "9815660901";
        mvc.perform(patch(Routes.Flatmates.ROOMS + "/" + roomId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content(roomBody(host, "tenant", other)))
                .andExpect(status().isOk());
        commit();

        linkSentTo(other);
        assertThat(noticeRows(roomId)).isEqualTo(2);
        view(oldToken).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("no second notice goes to the same owner for the same room")
    void aRepeatedEditDoesNotRepeatTheMessage() throws Exception {
        User host = user("9815660012", "Asha Rao");
        String roomId = tenantRoomWithNotice(host, OWNER);

        mvc.perform(patch(Routes.Flatmates.ROOMS + "/" + roomId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content(roomBody(host, "tenant", OWNER)))
                .andExpect(status().isOk());
        commit();

        assertThat(noticeRows(roomId)).isEqualTo(1);
    }

    @Test
    @DisplayName("a host past five notices a day posts fine but messages nobody more")
    void theHostCapSkipsSilently() throws Exception {
        User host = user("9815660013", "Asha Rao");
        String roomId = tenantRoomWithNotice(host, OWNER);
        for (int i = 0; i < 4; i++) {
            insertNotice(roomId, host.getId(), "981566091" + i);
        }

        String other = "9815660902";
        mvc.perform(patch(Routes.Flatmates.ROOMS + "/" + roomId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content(roomBody(host, "tenant", other)))
                .andExpect(status().isOk());
        commit();

        assertThat(noticeRows(roomId)).isEqualTo(5);
        verify(messenger, never()).sendOwnerNotice(eq(other), any(), any(), any());
    }

    @Test
    @DisplayName("an owner already messaged three times a day by anyone is left alone")
    void theOwnerCapSkipsSilently() throws Exception {
        User first = user("9815660014", "Asha Rao");
        User second = user("9815660015", "Ravi Nair");
        String firstRoom = tenantRoomWithNotice(first, OWNER);
        insertNotice(firstRoom, second.getId(), OWNER);
        insertNotice(firstRoom, second.getId(), OWNER);

        User third = user("9815660016", "Meera Shah");
        String roomId = idOf(postRoom(third, roomBody(third, "tenant", OWNER)));
        commit();

        assertThat(noticeRows(roomId)).isZero();
    }

    @Test
    @DisplayName("a room with the deposit left out is a 422, while 0 is accepted")
    void roomDepositIsRequired() throws Exception {
        User host = user("9815660017", "Own Er");

        postRoom(host, roomBody(host, "owner", null, "")).andExpect(status().isUnprocessableEntity())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("deposit")));
        postRoom(host, roomBody(host, "owner", null, "\"deposit\":0,")).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("a flat-in-hand group needs a deposit; a hunting group needs a deposit ceiling; 0 is fine")
    void groupDepositIsRequired() throws Exception {
        User host = user("9815660018", "Asha Rao");
        String flat = """
                {"title":"Two of us","locality":"Baner","policy":"any","rent":40000,%s
                 "seats":3,"seatsOpen":1,"name":"Host"}
                """;
        String hunting = """
                {"title":"Three of us, hunting","policy":"any","seats":3,"seatsOpen":1,"name":"Asha",
                 "preferences":{"localities":["Baner"],"bhk":["2"],"rentMin":30000,"rentMax":54000,%s
                   "gatedOnly":false,"bachelors":false}}
                """;

        postGroup(host, flat.formatted("")).andExpect(status().isUnprocessableEntity())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("deposit")));
        postGroup(host, hunting.formatted("")).andExpect(status().isUnprocessableEntity())
                .andExpect(content().string(org.hamcrest.Matchers.containsString("depositMax")));
        postGroup(host, hunting.formatted("\"depositMax\":0,")).andExpect(status().isCreated());
    }

    private ResultActions postGroup(User host, String body) throws Exception {
        return mvc.perform(post(Routes.Flatmates.GROUPS)
                .header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }
}
