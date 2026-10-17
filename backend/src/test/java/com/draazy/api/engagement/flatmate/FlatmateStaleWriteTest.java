package com.draazy.api.engagement.flatmate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.persistence.RateLimitLock;
import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.PersonalDocument;
import com.draazy.api.documents.vault.PersonalDocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractCommittedApiTest;
import com.draazy.api.support.UploadedPhotos;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.RequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

@DisplayName("Flatmates — a write that waited on a lock never puts back what it read before the lock")
class FlatmateStaleWriteTest extends AbstractCommittedApiTest {

    @Autowired
    TransactionTemplate tx;

    @Autowired
    RateLimitLock locks;

    @Autowired
    PropertyRepository properties;

    @Autowired
    PersonalDocumentRepository personalDocuments;

    @Autowired
    FlatmateGuardrails guardrails;

    @Override
    protected String mobilePrefix() {
        return "97914277";
    }

    private static String idIn(String json) {
        return json.replaceAll(".*?\"id\"\\s*:\\s*\"([^\"]+)\".*", "$1");
    }

    private String created(RequestBuilder request) throws Exception {
        return idIn(mvc.perform(request).andReturn().getResponse().getContentAsString());
    }

    /** The rival holds the lock, lets {@code call} start and block behind it, then commits its own write. */
    private int race(Runnable lock, Runnable rivalWrite, RequestBuilder call) throws Exception {
        CountDownLatch held = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<?> rival = pool.submit(() -> tx.executeWithoutResult(status -> {
                lock.run();
                held.countDown();
                try {
                    Thread.sleep(1500);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                rivalWrite.run();
            }));
            assertThat(held.await(30, TimeUnit.SECONDS)).isTrue();
            Future<Integer> blocked = pool.submit(() -> mvc.perform(call).andReturn().getResponse().getStatus());
            rival.get(60, TimeUnit.SECONDS);
            return blocked.get(60, TimeUnit.SECONDS);
        } finally {
            pool.shutdownNow();
        }
    }

    private String column(String table, String column, String id) {
        return jdbc.queryForObject("select " + column + " from " + table + " where id = ?::uuid", String.class, id);
    }

    @Test
    @DisplayName("a takedown of an application waiting on the owner's accept keeps the accept")
    void applicationModerationKeepsOwnersDecision() throws Exception {
        User owner = user("01", Roles.Wire.OWNER);
        User host = user("02", Roles.Wire.BUYER);
        User staff = user("03", Roles.Wire.ADMIN);
        Property flat = new Property(owner, "3BHK in Kothrud", "rent", "apartment", 45000L, "Kothrud", "Pune");
        flat.setBhk(new BigDecimal("3"));
        flat.setStatus("approved");
        flat.setPriceUnit("per-month");
        flat.setArea(new BigDecimal("1100"));
        properties.saveAndFlush(flat);
        String groupId = created(post(Routes.Flatmates.GROUPS).header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"title":"Three of us","locality":"Kothrud","policy":"any","rent":45000,
                         "seats":3,"seatsOpen":1,"name":"Host"}"""));
        jdbc.update("update flatmate_groups set mod_status = 'approved' where id = ?::uuid", groupId);
        String applicationId = created(post(Routes.Flatmates.GROUP_APPLY.replace("{id}", groupId))
                .header(HttpHeaders.AUTHORIZATION, bearer(host)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"listingId\":\"" + flat.getId() + "\"}"));

        int status = race(
                () -> locks.holdUntilCommit(RateLimitLock.Limit.FLATMATE_LISTING_DECISION, flat.getId().toString()),
                () -> jdbc.update("update flatmate_group_applications set status = 'accepted', decided_at = now() "
                        + "where id = ?::uuid", applicationId),
                patch(Routes.Moderation.GROUP_APPLICATION_BY_ID, applicationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"modStatus\":\"removed\",\"note\":\"Fake group\"}"));

        assertThat(status).isEqualTo(200);
        assertThat(column("flatmate_group_applications", "status", applicationId)).isEqualTo("accepted");
        assertThat(column("flatmate_group_applications", "mod_status", applicationId)).isEqualTo("removed");
    }

    @Test
    @DisplayName("a badge decision waiting on a takedown of the room keeps the takedown")
    void badgeDecisionKeepsTakedown() throws Exception {
        User host = user("04", Roles.Wire.BUYER);
        User staff = user("05", Roles.Wire.ADMIN);
        PersonalDocument doc = personalDocuments.saveAndFlush(new PersonalDocument(host.getId(),
                "Registered Leave and Licence", "leave-and-licence.pdf",
                "personal/" + host.getId() + "/" + UUID.randomUUID(), 184320L, "application/pdf"));
        String roomId = created(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"bhk":"2","roomType":"Private room","attachedBath":"attached","furnishing":"semi",
                         "locality":"Baner","society":"Stale Write Heights","rentShare":15000,"deposit":30000,
                         "availableFrom":"2026-12-01","lookingFor":"any","foodPref":"any",
                         "agreementDeclared":true,"photos":["%s"],"note":"Sunny room.",%s}
                        """.formatted(UploadedPhotos.of(host.getId()), FlatmateAgreementFixture.EVIDENCE)
                        .replace("\"id\":\"agr-doc-1\"", "\"id\":\"" + doc.getId() + "\"")));
        String reviewId = jdbc.queryForObject("select id::text from flatmate_reviews where room_id = ?::uuid",
                String.class, roomId);
        jdbc.update("update flatmate_reviews set owner_consent = true where id = ?::uuid", reviewId);

        int status = race(
                () -> jdbc.queryForList("select id from flatmate_rooms where id = ?::uuid for update", roomId),
                () -> jdbc.update("update flatmate_rooms set mod_status = 'removed' where id = ?::uuid", roomId),
                patch(Routes.Moderation.FLATMATE_REVIEW_BY_ID, reviewId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff)).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"approved\",\"note\":\"ok\"}"));

        assertThat(status).isEqualTo(200);
        assertThat(column("flatmate_rooms", "mod_status", roomId)).isEqualTo("removed");
        assertThat(column("flatmate_rooms", "verification_tier", roomId)).isEqualTo("tenant");
    }

    @Test
    @DisplayName("a renewal waiting on a takedown renews into the takedown, not over it")
    void renewKeepsTakedown() throws Exception {
        User seeker = user("06", Roles.Wire.BUYER);
        String postId = created(post(Routes.Flatmates.POSTS).header(HttpHeaders.AUTHORIZATION, bearer(seeker))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Asha\",\"budget\":18000,\"localities\":[\"Baner\"]}"));
        jdbc.update("update flatmate_seeker_posts set mod_status = 'expired', expired_from = 'approved' "
                + "where id = ?::uuid", postId);

        int status = race(
                () -> jdbc.queryForList("select id from flatmate_seeker_posts where id = ?::uuid for update", postId),
                () -> jdbc.update("update flatmate_seeker_posts set mod_status = 'removed' where id = ?::uuid", postId),
                post(Routes.Flatmates.RENEW, "post", postId).header(HttpHeaders.AUTHORIZATION, bearer(seeker)));

        assertThat(status).isBetween(200, 299);
        assertThat(column("flatmate_seeker_posts", "mod_status", postId)).isEqualTo("removed");
    }

    @Test
    @DisplayName("owner consent waiting on a takedown of the room records consent without republishing it")
    void ownerConsentKeepsTakedown() throws Exception {
        User host = user("07", Roles.Wire.BUYER);
        String ownerMobile = "9791427799";
        PersonalDocument doc = personalDocuments.saveAndFlush(new PersonalDocument(host.getId(),
                "Registered Leave and Licence", "leave-and-licence.pdf",
                "personal/" + host.getId() + "/" + UUID.randomUUID(), 184320L, "application/pdf"));
        String roomId = created(post(Routes.Flatmates.ROOMS).header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"bhk":"2","roomType":"Private room","attachedBath":"attached","furnishing":"semi",
                         "locality":"Baner","society":"Consent Race Towers","rentShare":15000,"deposit":30000,
                         "availableFrom":"2026-12-01","lookingFor":"any","foodPref":"any",
                         "agreementDeclared":true,"photos":["%s"],"note":"Sunny room.",%s}
                        """.formatted(UploadedPhotos.of(host.getId()), FlatmateAgreementFixture.EVIDENCE)
                        .replace("\"id\":\"agr-doc-1\"", "\"id\":\"" + doc.getId() + "\"")));
        jdbc.update("update flatmate_rooms set mod_status = 'live', owner_consent_mobile = ?, address_fingerprint = ? "
                + "where id = ?::uuid", ownerMobile, guardrails.fingerprint(
                        new FlatmateGuardrails.Address(null, "Consent Race Towers", "Baner", null)), roomId);
        String consent = """
                {"ownerMobile":"%s","society":"Consent Race Towers","locality":"Baner"%s}""";
        mvc.perform(post(Routes.Flatmates.OWNER_CONSENT).header(HttpHeaders.AUTHORIZATION, bearer(host))
                .contentType(MediaType.APPLICATION_JSON).content(consent.formatted(ownerMobile, "")));
        jdbc.update("update otp_codes set code_hash = ? where id = (select id from otp_codes where mobile = ? "
                + "order by created_at desc limit 1)", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                        .digest("424242".getBytes(StandardCharsets.UTF_8))), ownerMobile);

        int status = race(
                () -> jdbc.queryForList("select id from flatmate_rooms where id = ?::uuid for update", roomId),
                () -> jdbc.update("update flatmate_rooms set mod_status = 'removed' where id = ?::uuid", roomId),
                post(Routes.Flatmates.OWNER_CONSENT).header(HttpHeaders.AUTHORIZATION, bearer(host))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(consent.formatted(ownerMobile, ",\"otp\":\"424242\"")));

        assertThat(status).isEqualTo(200);
        assertThat(column("flatmate_rooms", "mod_status", roomId)).isEqualTo("removed");
        assertThat(column("flatmate_rooms", "owner_consent::text", roomId)).isEqualTo("true");
    }

    @Test
    @DisplayName("an unsplit waiting on an accepted request sees the new occupant and refuses")
    void unsplitSeesNewOccupant() throws Exception {
        User owner = user("08", Roles.Wire.OWNER);
        Property flat = new Property(owner, "3BHK in Aundh", "rent", "apartment", 45000L, "Aundh", "Pune");
        flat.setBhk(new BigDecimal("3"));
        flat.setStatus("approved");
        flat.setPriceUnit("per-month");
        flat.setArea(new BigDecimal("1100"));
        properties.saveAndFlush(flat);
        mvc.perform(post(Routes.Properties.SPLIT, flat.getId()).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"maxOccupants":4,"rooms":[{"roomKind":"master","rent":15000},
                                                   {"roomKind":"bedroom","rent":12000}]}"""));
        String roomId = jdbc.queryForObject("select id::text from flatmate_rooms where property_id = ? "
                + "and archived = false order by id limit 1", String.class, flat.getId());

        int status = race(
                () -> jdbc.queryForList("select id from flatmate_rooms where property_id = ? and archived = false "
                        + "order by id for update", flat.getId()),
                () -> jdbc.update("update flatmate_rooms set occupants = 1 where id = ?::uuid", roomId),
                delete(Routes.Properties.SPLIT, flat.getId()).header(HttpHeaders.AUTHORIZATION, bearer(owner)));

        assertThat(status).isEqualTo(409);
        assertThat(column("flatmate_rooms", "occupants", roomId)).isEqualTo("1");
        assertThat(column("flatmate_rooms", "archived::text", roomId)).isEqualTo("false");
    }
}
