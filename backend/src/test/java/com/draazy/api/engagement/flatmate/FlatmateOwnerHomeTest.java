package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.identity.user.erasure.AccountErased;
import com.draazy.api.provider.DecisionMessenger;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@DisplayName("Flatmates — an owner who confirms a room gets an account, a private home, and a way to list it")
class FlatmateOwnerHomeTest extends AbstractApiTest {

    private static final String TOKEN_HEADER = "X-Owner-Notice-Token";
    private static final String OWNER_PREFIX = "98156701";
    private static final String HOST_PREFIX = "98156702";

    @Autowired
    UserRepository users;

    @Autowired
    FlatmateOwnerNoticeService noticeService;

    @Autowired
    ApplicationEventPublisher events;

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

    // The audit row and a provisioned owner commit in their own transaction, so the rollback cannot take them back.
    @AfterAll
    static void removeWhatEscapedRollback() {
        cleanup.update("delete from audit_log where actor = 'owner-link'");
        cleanup.update("delete from users where mobile like ?", OWNER_PREFIX + "%");
    }

    private static String ownerMobile(int n) {
        return OWNER_PREFIX + "%02d".formatted(n);
    }

    private User host(int n, String name) {
        User u = new User(HOST_PREFIX + "%02d".formatted(n), Roles.Wire.BUYER);
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private User existingOwner(int n) {
        User u = new User(ownerMobile(n), Roles.Wire.BUYER);
        u.setName("Olga Owner");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String roomBody(User host, String ownerMobile, String homeType) {
        return withSocietyIds("""
                {"bhk":"2","roomType":"Private room","attachedBath":"attached","homeTypeLabel":"%s",
                 "furnishing":"semi","locality":"Baner","society":"Notice Heights","flatNumber":"B-12",
                 "noticePeriodDays":30,"lockInMonths":0,
                 "rentShare":15000,"deposit":30000,"availableFrom":"2026-09-01","lookingFor":"any",
                 "foodPref":"any",%s,"hostRole":"tenant","ownerConsent":true,
                 "ownerConsentMobile":"%s","note":"Sunny room, quiet building.",
                 "details":{"floor":"4","totalFloors":12,"bathrooms":2,"balconies":1,"tower":"B"%s}}
                """.formatted(homeType, FlatmateRoomFixture.photos(host.getId()), ownerMobile,
                "Flat".equals(homeType) ? "" : ",\"floorsInHouse\":2"));
    }

    private String postRoom(User host, String ownerMobile, String homeType) throws Exception {
        String json = mvc.perform(post(Routes.Flatmates.ROOMS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON).content(roomBody(host, ownerMobile, homeType)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        commit();
        return json.replaceAll("(?s).*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String postRoom(User host, String ownerMobile) throws Exception {
        return postRoom(host, ownerMobile, "Flat");
    }

    // The test transaction never commits, so the after-commit send is driven by hand.
    private void commit() {
        for (TransactionSynchronization s : TransactionSynchronizationManager.getSynchronizations()) {
            if (fired.add(s)) {
                s.afterCommit();
            }
        }
    }

    private List<String> tokensSentTo(String mobile) {
        ArgumentCaptor<String> link = ArgumentCaptor.forClass(String.class);
        verify(messenger, atLeastOnce()).sendOwnerNotice(eq(mobile), any(), any(), link.capture());
        return link.getAllValues().stream().map(l -> l.substring(l.indexOf('#') + 1)).toList();
    }

    private ResultActions view(String token) throws Exception {
        return mvc.perform(get(Routes.Flatmates.OWNER_NOTICE).header(TOKEN_HEADER, token));
    }

    private ResultActions answer(String token, String answer) throws Exception {
        return mvc.perform(post(Routes.Flatmates.OWNER_NOTICE_ANSWER).header(TOKEN_HEADER, token)
                .contentType(MediaType.APPLICATION_JSON).content("{\"answer\":\"" + answer + "\"}"));
    }

    private void agree(String ownerMobile) throws Exception {
        answer(tokensSentTo(ownerMobile).getFirst(), "agree").andExpect(status().isOk());
    }

    private List<Map<String, Object>> homesOfOwnerWith(String ownerMobile) {
        return jdbc.queryForList("""
                select m.* from managed_properties m join users u on u.id = m.owner_id
                where u.mobile = ?
                """, ownerMobile);
    }

    private int usersWith(String mobile) {
        return jdbc.queryForObject("select count(*) from users where mobile = ?", Integer.class, mobile);
    }

    private void setSignups(boolean open) {
        jdbc.update("update settings set value = jsonb_set(value, '{signupsEnabled}', ?::jsonb) where key = 'flags'",
                String.valueOf(open));
        em.flush();
        em.clear();
    }

    private boolean consentGranted(String roomId) {
        return jdbc.queryForObject("select owner_consent from flatmate_rooms where id = ?::uuid",
                Boolean.class, roomId);
    }

    private String sourceRoomOf(String ownerMobile) {
        return String.valueOf(homesOfOwnerWith(ownerMobile).getFirst().get("source_room_id"));
    }

    private String bearerForOwner(String mobile) {
        return bearer(users.findByMobile(mobile).orElseThrow());
    }

    private String homeIdOf(String mobile) throws Exception {
        String json = mvc.perform(get(Routes.Flatmates.OWNER_HOMES).header(HttpHeaders.AUTHORIZATION,
                        bearerForOwner(mobile)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.replaceAll("(?s).*?\"managedId\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    @Test
    @DisplayName("agree provisions an unverified owner and a private rent home with the room's facts")
    void agreeProvisionsTheOwnerAndSavesTheHome() throws Exception {
        String owner = ownerMobile(1);
        String roomId = postRoom(host(1, "Asha Rao"), owner, "Independent House");

        assertThat(usersWith(owner)).isZero();
        agree(owner);

        Map<String, Object> user = jdbc.queryForMap("select mobile_verified, archived from users where mobile = ?",
                owner);
        assertThat(user.get("mobile_verified")).isEqualTo(false);
        List<Map<String, Object>> homes = homesOfOwnerWith(owner);
        assertThat(homes).hasSize(1);
        Map<String, Object> home = homes.getFirst();
        assertThat(home.get("deal")).isEqualTo("rent");
        assertThat(home.get("price")).isEqualTo(0L);
        assertThat(home.get("property_type")).isEqualTo("independent");
        assertThat(home.get("title")).isEqualTo("2 BHK Independent House in Notice Heights");
        assertThat(home.get("locality")).isEqualTo("Baner");
        assertThat(home.get("locality_slug")).isEqualTo("baner");
        assertThat(home.get("society")).isEqualTo("Notice Heights");
        assertThat(home.get("furnishing")).isEqualTo("semi-furnished");
        assertThat(String.valueOf(home.get("source_room_id"))).isEqualTo(roomId);
        assertThat(home.get("address_fingerprint")).isNotNull();
        assertThat(home.get("published_listing_id")).isNull();
        assertThat(consentGranted(roomId)).isTrue();
        assertThat(jdbc.queryForObject("""
                select count(*) from audit_log where actor = 'owner-link'
                  and action = 'user.provision_from_owner_notice' and metadata::text not like ?
                  and entity_id = (select id::text from users where mobile = ?)
                """, Integer.class, "%" + owner + "%", owner)).isEqualTo(1);
    }

    @Test
    @DisplayName("a villa maps to villa and a row house to independent")
    void homeTypeVocabularyMaps() throws Exception {
        String villaOwner = ownerMobile(2);
        postRoom(host(2, "Asha Rao"), villaOwner, "Villa");
        agree(villaOwner);
        String otherOwner = ownerMobile(3);
        postRoom(host(3, "Ravi Nair"), otherOwner, "Row House");
        agree(otherOwner);

        assertThat(homesOfOwnerWith(villaOwner).getFirst().get("property_type")).isEqualTo("villa");
        assertThat(homesOfOwnerWith(otherOwner).getFirst().get("property_type")).isEqualTo("independent");
    }

    @Test
    @DisplayName("a second room in the same flat leaves the owner with one home")
    void aSecondRoomInTheSameFlatIsOneHome() throws Exception {
        String owner = ownerMobile(4);
        postRoom(host(4, "Asha Rao"), owner);
        postRoom(host(5, "Ravi Nair"), owner);

        for (String token : tokensSentTo(owner)) {
            answer(token, "agree").andExpect(status().isOk()).andExpect(jsonPath("$.homeSaved").value(true));
        }

        assertThat(homesOfOwnerWith(owner)).hasSize(1);
        assertThat(usersWith(owner)).isEqualTo(1);
    }

    @Test
    @DisplayName("a live account is reused rather than provisioned again")
    void anExistingOwnerIsReused() throws Exception {
        String owner = ownerMobile(5);
        User existing = existingOwner(5);
        postRoom(host(6, "Asha Rao"), owner);
        agree(owner);

        assertThat(usersWith(owner)).isEqualTo(1);
        assertThat(homesOfOwnerWith(owner)).hasSize(1);
        assertThat(homesOfOwnerWith(owner).getFirst().get("owner_id")).isEqualTo(existing.getId());
        assertThat(jdbc.queryForObject("select count(*) from audit_log where actor = 'owner-link' "
                + "and action = 'user.provision_from_owner_notice' and entity_id = ?", Integer.class,
                existing.getId().toString())).isZero();
    }

    @Test
    @DisplayName("an archived account is not resurrected and gets no home, but consent still stands")
    void anArchivedOwnerGetsNothing() throws Exception {
        String owner = ownerMobile(6);
        User gone = existingOwner(6);
        gone.archive("erased");
        users.saveAndFlush(gone);
        String roomId = postRoom(host(7, "Asha Rao"), owner);

        answer(tokensSentTo(owner).getFirst(), "agree").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("agreed")).andExpect(jsonPath("$.homeSaved").value(false));

        assertThat(homesOfOwnerWith(owner)).isEmpty();
        assertThat(jdbc.queryForObject("select archived from users where mobile = ?", Boolean.class, owner)).isTrue();
        assertThat(consentGranted(roomId)).isTrue();
    }

    @Test
    @DisplayName("with signups closed no account or home is made, but consent still stands")
    void closedSignupsStillGrantConsent() throws Exception {
        String owner = ownerMobile(7);
        String roomId = postRoom(host(8, "Asha Rao"), owner);
        setSignups(false);

        answer(tokensSentTo(owner).getFirst(), "agree").andExpect(status().isOk())
                .andExpect(jsonPath("$.homeSaved").value(false));

        assertThat(usersWith(owner)).isZero();
        assertThat(consentGranted(roomId)).isTrue();
    }

    @Test
    @DisplayName("declining creates no account and no home")
    void declineCreatesNothing() throws Exception {
        String owner = ownerMobile(8);
        postRoom(host(9, "Asha Rao"), owner);

        answer(tokensSentTo(owner).getFirst(), "decline").andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("declined")).andExpect(jsonPath("$.homeSaved").value(false));

        assertThat(usersWith(owner)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from managed_properties where address_fingerprint is not null "
                + "and source_room_id is not null and title like '%Notice Heights%'", Integer.class)).isZero();
    }

    @Test
    @DisplayName("homeSaved is true on the view and on the answer once the home exists, false before")
    void homeSavedFollowsTheHome() throws Exception {
        String owner = ownerMobile(9);
        postRoom(host(10, "Asha Rao"), owner);
        String token = tokensSentTo(owner).getFirst();

        view(token).andExpect(jsonPath("$.status").value("sent")).andExpect(jsonPath("$.homeSaved").value(false));
        answer(token, "agree").andExpect(jsonPath("$.homeSaved").value(true));
        view(token).andExpect(jsonPath("$.status").value("agreed")).andExpect(jsonPath("$.homeSaved").value(true));
    }

    @Test
    @DisplayName("the owner's homes list shows each flat with its confirmed live rooms and only a tenant first name")
    void ownerHomesListsRoomsWithoutTenantContact() throws Exception {
        String owner = ownerMobile(10);
        User asha = host(11, "Asha Rao");
        String live = postRoom(asha, owner);
        String archived = postRoom(host(12, "Ravi Nair"), owner);
        for (String token : tokensSentTo(owner)) {
            answer(token, "agree").andExpect(status().isOk());
        }
        mvc.perform(delete(Routes.Flatmates.ROOM_BY_ID.replace("{id}", archived))
                .header(HttpHeaders.AUTHORIZATION, bearer(users.findById(
                        jdbc.queryForObject("select host_id from flatmate_rooms where id = ?::uuid", UUID.class,
                                archived)).orElseThrow()))).andExpect(status().isNoContent());
        String stranger = ownerMobile(11);
        postRoom(host(13, "Meera Iyer"), stranger);
        agree(stranger);

        String json = mvc.perform(get(Routes.Flatmates.OWNER_HOMES)
                        .header(HttpHeaders.AUTHORIZATION, bearerForOwner(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].title").value("2 BHK Flat in Notice Heights"))
                .andExpect(jsonPath("$[0].society").value("Notice Heights"))
                .andExpect(jsonPath("$[0].locality").value("Baner"))
                .andExpect(jsonPath("$[0].bhk").value(2))
                .andExpect(jsonPath("$[0].furnishing").value("semi-furnished"))
                .andExpect(jsonPath("$[0].publishedListingId").doesNotExist())
                .andExpect(jsonPath("$[0].rooms.length()").value(1))
                .andExpect(jsonPath("$[0].rooms[0].id").value(live))
                .andExpect(jsonPath("$[0].rooms[0].roomType").value("Private room"))
                .andExpect(jsonPath("$[0].rooms[0].budget").value(15000))
                .andExpect(jsonPath("$[0].rooms[0].deposit").value(30000))
                .andExpect(jsonPath("$[0].rooms[0].availableFrom").value("2026-09-01"))
                .andExpect(jsonPath("$[0].rooms[0].photo").isNotEmpty())
                .andExpect(jsonPath("$[0].rooms[0].tenantFirstName").value("Asha"))
                .andReturn().getResponse().getContentAsString();

        assertThat(json).doesNotContain("Rao").doesNotContain(HOST_PREFIX).doesNotContain("Meera");
    }

    @Test
    @DisplayName("owner homes need a session")
    void ownerHomesNeedASession() throws Exception {
        mvc.perform(get(Routes.Flatmates.OWNER_HOMES)).andExpect(status().isUnauthorized());
        mvc.perform(get(Routes.Flatmates.OWNER_HOME_PREFILL.replace("{managedId}", UUID.randomUUID().toString())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("prefill hands the wizard the room's facts, and a stranger's record is a 404")
    void prefillReturnsTheRoomFacts() throws Exception {
        String owner = ownerMobile(12);
        postRoom(host(14, "Asha Rao"), owner, "Villa");
        agree(owner);
        String managedId = homeIdOf(owner);
        String path = Routes.Flatmates.OWNER_HOME_PREFILL.replace("{managedId}", managedId);

        mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearerForOwner(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.managedId").value(managedId))
                .andExpect(jsonPath("$.homeTypeLabel").value("Villa"))
                .andExpect(jsonPath("$.bhk").value("2"))
                .andExpect(jsonPath("$.furnishing").value("semi"))
                .andExpect(jsonPath("$.locality").value("Baner"))
                .andExpect(jsonPath("$.localitySlug").value("baner"))
                .andExpect(jsonPath("$.society").value("Notice Heights"))
                .andExpect(jsonPath("$.societyId").isNotEmpty())
                .andExpect(jsonPath("$.flatNumber").value("B-12"))
                .andExpect(jsonPath("$.floor").value("4"))
                .andExpect(jsonPath("$.totalFloors").value(12))
                .andExpect(jsonPath("$.bathrooms").value(2))
                .andExpect(jsonPath("$.balconies").value(1))
                .andExpect(jsonPath("$.tower").value("B"));

        User other = existingOwner(13);
        mvc.perform(get(path).header(HttpHeaders.AUTHORIZATION, bearer(other))).andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("prefill falls back to the record's own facts when the source room is gone")
    void prefillFallsBackToTheRecord() throws Exception {
        String owner = ownerMobile(14);
        postRoom(host(15, "Asha Rao"), owner);
        agree(owner);
        String managedId = homeIdOf(owner);
        jdbc.update("delete from flatmate_owner_notices");
        jdbc.update("delete from flatmate_rooms where id = ?::uuid", sourceRoomOf(owner));
        em.clear();

        mvc.perform(get(Routes.Flatmates.OWNER_HOME_PREFILL.replace("{managedId}", managedId))
                        .header(HttpHeaders.AUTHORIZATION, bearerForOwner(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.bhk").value("2"))
                .andExpect(jsonPath("$.furnishing").value("semi"))
                .andExpect(jsonPath("$.locality").value("Baner"))
                .andExpect(jsonPath("$.society").value("Notice Heights"))
                .andExpect(jsonPath("$.flatNumber").doesNotExist())
                .andExpect(jsonPath("$.homeTypeLabel").doesNotExist());
    }

    @Test
    @DisplayName("publishing a private home through the wizard lists it pending, links it, and refuses a second time")
    void publishWithCreatesOneListing() throws Exception {
        String owner = ownerMobile(15);
        User existing = existingOwner(15);
        postRoom(host(16, "Asha Rao"), owner);
        agree(owner);
        String managedId = homeIdOf(owner);
        String path = Routes.MeManagedProperties.BASE + "/" + managedId + "/listing";
        String body = "{\"title\":\"Sunny 2 BHK\",\"deal\":\"rent\",\"propertyType\":\"apartment\","
                + "\"price\":25000,\"locality\":\"Baner\",\"city\":\"Pune\"," + listingImages(existing) + "}";

        mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, bearer(existing))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").exists());

        UUID listingId = jdbc.queryForObject("select published_listing_id from managed_properties where id = ?::uuid",
                UUID.class, managedId);
        assertThat(listingId).isNotNull();
        assertThat(jdbc.queryForMap("select owner_id, status from properties where id = ?", listingId))
                .containsEntry("owner_id", existing.getId()).containsEntry("status", "pending");

        mvc.perform(post(path).header(HttpHeaders.AUTHORIZATION, bearer(existing))
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());

        mvc.perform(get(Routes.Flatmates.OWNER_HOMES).header(HttpHeaders.AUTHORIZATION, bearer(existing)))
                .andExpect(jsonPath("$[0].publishedListingId").value(listingId.toString()));
    }

    @Test
    @DisplayName("publishing someone else's private home is a 404 and lists nothing")
    void publishWithRefusesAStrangersHome() throws Exception {
        String owner = ownerMobile(16);
        existingOwner(16);
        postRoom(host(17, "Asha Rao"), owner);
        agree(owner);
        String managedId = homeIdOf(owner);
        User stranger = existingOwner(17);

        mvc.perform(post(Routes.MeManagedProperties.BASE + "/" + managedId + "/listing")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"Not mine\",\"deal\":\"rent\",\"propertyType\":\"apartment\","
                                + "\"price\":25000,\"locality\":\"Baner\",\"city\":\"Pune\"," + listingImages(stranger)
                                + "}"))
                .andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("select count(*) from properties where owner_id = ?", Integer.class,
                stranger.getId())).isZero();
    }

    @Test
    @DisplayName("purging removes only the notices that have expired")
    void purgeRemovesOnlyExpiredNotices() throws Exception {
        String owner = ownerMobile(17);
        String roomId = postRoom(host(18, "Asha Rao"), owner);
        UUID hostId = jdbc.queryForObject("select host_id from flatmate_rooms where id = ?::uuid", UUID.class,
                roomId);
        jdbc.update("update flatmate_owner_notices set expires_at = now() - interval '1 day'");
        jdbc.update("""
                insert into flatmate_owner_notices (room_id, host_id, owner_mobile, address_fingerprint,
                    token_hash, expires_at)
                values (?::uuid, ?, ?, 'filler', ?, now() + interval '5 days')
                """, roomId, hostId, ownerMobile(18), UUID.randomUUID().toString());
        int before = jdbc.queryForObject("select count(*) from flatmate_owner_notices", Integer.class);
        int expired = jdbc.queryForObject(
                "select count(*) from flatmate_owner_notices where expires_at < now()", Integer.class);

        assertThat(noticeService.purgeExpired()).isEqualTo(expired);

        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices", Integer.class))
                .isEqualTo(before - expired);
        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices where expires_at < now()",
                Integer.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices where owner_mobile = ?",
                Integer.class, ownerMobile(18))).isEqualTo(1);
    }

    @Test
    @DisplayName("erasing a host deletes the notices they caused, and those addressed to their own number")
    void erasureDeletesTheHostsNotices() throws Exception {
        String owner = ownerMobile(19);
        User asha = host(19, "Asha Rao");
        String roomId = postRoom(asha, owner);
        User other = host(20, "Ravi Nair");
        String otherRoom = postRoom(other, ownerMobile(20));
        jdbc.update("""
                insert into flatmate_owner_notices (room_id, host_id, owner_mobile, address_fingerprint,
                    token_hash, expires_at)
                values (?::uuid, ?, ?, 'filler', ?, now() + interval '5 days')
                """, otherRoom, other.getId(), asha.getMobile(), UUID.randomUUID().toString());

        events.publishEvent(new AccountErased(asha.getId()));

        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices where room_id = ?::uuid",
                Integer.class, roomId)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices where owner_mobile = ?",
                Integer.class, asha.getMobile())).isZero();
        assertThat(jdbc.queryForObject("select count(*) from flatmate_owner_notices where room_id = ?::uuid",
                Integer.class, otherRoom)).isEqualTo(1);
    }

    @Test
    @DisplayName("the tenant is told in-app when the owner agrees, with a link to their room")
    void hostIsToldOnAgree() throws Exception {
        String owner = ownerMobile(21);
        User asha = host(21, "Asha Rao");
        String roomId = postRoom(asha, owner);
        agree(owner);

        Map<String, Object> note = jdbc.queryForMap(
                "select type, title, body, link from notifications where user_id = ? and type = ?",
                asha.getId(), "flatmate.ownerNotice.agreed");
        assertThat(note.get("title")).isEqualTo("The owner confirmed your room");
        assertThat(note.get("body")).isEqualTo(
                "The owner of Notice Heights, Baner said yes on WhatsApp. Your post can now earn the Verified property badge.");
        assertThat(note.get("link")).isEqualTo("/flatmates/room/" + roomId);
    }

    @Test
    @DisplayName("the tenant is told in-app when the owner declines")
    void hostIsToldOnDecline() throws Exception {
        String owner = ownerMobile(22);
        User asha = host(22, "Asha Rao");
        String roomId = postRoom(asha, owner);
        answer(tokensSentTo(owner).getFirst(), "decline").andExpect(status().isOk());

        Map<String, Object> note = jdbc.queryForMap(
                "select title, body, link from notifications where user_id = ? and type = ?",
                asha.getId(), "flatmate.ownerNotice.declined");
        assertThat(note.get("title")).isEqualTo("The owner said no to your room");
        assertThat(note.get("body")).isEqualTo("Notice Heights, Baner is back in review. Ops will contact you.");
        assertThat(note.get("link")).isEqualTo("/flatmates/room/" + roomId);
    }
}
