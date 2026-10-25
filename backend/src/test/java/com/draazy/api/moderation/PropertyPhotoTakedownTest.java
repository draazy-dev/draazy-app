package com.draazy.api.moderation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.photo.ListingPhotoFiles;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.moderation.verification.PropertyReviewRepository;
import com.draazy.api.provider.FileStorage;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@DisplayName("Moderation — staff take down one photo")
class PropertyPhotoTakedownTest extends AbstractApiTest {

    private static final String PREFIX = "/api/dev/storage/public/";

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired PropertyReviewRepository reviews;
    @MockitoSpyBean FileStorage storage;

    @BeforeEach
    void pinPublicPrefix() {
        doReturn(PREFIX).when(storage).publicUrlPrefix();
    }

    // Audit rows commit through REQUIRES_NEW, so a rollback does not take them with it.
    @AfterEach
    void removeAuditRowsThatEscapedRollback() {
        jdbc.update("delete from audit_log where action = 'listing.photo.takedown'");
    }

    private User user(String mobile, String role, String functions) {
        User u = new User(mobile, role);
        u.setName("Photo " + mobile);
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        if ("staff".equals(role)) {
            jdbc.update("INSERT INTO back_office_permissions (user_id, permissions) VALUES (?::uuid, ?::jsonb)",
                    saved.getId().toString(), functions);
        }
        return saved;
    }

    private User staff(String mobile) {
        return user(mobile, "staff", "[\"propertyVerification\",\"listingModeration\"]");
    }

    private Property listing(User owner, String status, String... photos) {
        Property p = new Property(owner, "Photo flat", "rent", "apartment", 28000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("950"));
        p.setStatus(status);
        p.setLocalitySlug("baner");
        p.setImages(List.of(photos));
        p.setCoverImage(photos.length == 0 ? null : photos[0]);
        return properties.saveAndFlush(p);
    }

    private ResultActions takedown(User actor, Property p, String photo, String reason) throws Exception {
        return mvc.perform(post("/properties/" + p.getId() + "/photos/takedown")
                .header(HttpHeaders.AUTHORIZATION, bearer(actor))
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"photo\":\"" + photo + "\",\"reason\":\"" + reason + "\"}"));
    }

    private void commitSideEffects() {
        TransactionSynchronizationManager.getSynchronizations().stream()
                .filter(sync -> sync.getClass().getName().startsWith(ListingPhotoFiles.class.getName()))
                .forEach(TransactionSynchronization::afterCommit);
    }

    private String key(String url) {
        return url.substring(PREFIX.length());
    }

    private List<Map<String, Object>> audit(Property p) {
        return jdbc.queryForList("select * from audit_log where action = 'listing.photo.takedown'"
                + " and entity_id = ?", p.getId().toString());
    }

    @Test
    @DisplayName("the photo leaves the gallery and cover, is audited, and the owner is told with a link to add one")
    void removesPhotoAuditsAndNotifies() throws Exception {
        User owner = user("9860000001", "owner", null);
        User staff = staff("9860000002");
        String first = listingPhoto(owner);
        String second = listingPhoto(owner);
        Property p = listing(owner, PropertyStatus.APPROVED, first, second);

        takedown(staff, p, first, "people_visible").andExpect(status().isOk())
                .andExpect(jsonPath("$.images.length()").value(1))
                .andExpect(jsonPath("$.coverImage").value(second));

        Property after = properties.findById(p.getId()).orElseThrow();
        assertThat(after.getImages()).containsExactly(second);
        assertThat(after.getCoverImage()).isNull();
        assertThat(after.getStatus()).isEqualTo(PropertyStatus.APPROVED);
        assertThat(audit(p)).hasSize(1);
        assertThat(jdbc.queryForObject("select metadata->>'reason' from audit_log where id = ?", String.class,
                audit(p).get(0).get("id"))).isEqualTo("people_visible");
        Map<String, Object> notice = jdbc.queryForMap(
                "select title, body, link from notifications where user_id = ? and type = 'listing.photo_removed'",
                owner.getId());
        assertThat((String) notice.get("body")).contains("shows people");
        assertThat((String) notice.get("link")).isEqualTo("/list-property?edit=" + p.getId() + "&step=photos");
    }

    @Test
    @DisplayName("the stored file goes once nothing else shows it, and stays while another listing does")
    void deletesTheStoredFileOnlyWhenUnreferenced() throws Exception {
        User owner = user("9860000003", "owner", null);
        User staff = staff("9860000004");
        String alone = listingPhoto(owner);
        String shared = listingPhoto(owner);
        Property p = listing(owner, PropertyStatus.APPROVED, alone, shared, listingPhoto(owner));
        listing(owner, PropertyStatus.PENDING, shared);

        takedown(staff, p, shared, "contact_info").andExpect(status().isOk());
        takedown(staff, p, alone, "other").andExpect(status().isOk());
        commitSideEffects();

        verify(storage).deletePublic(key(alone));
        verify(storage).deletePublic(key(alone) + ".w960.jpg");
        verify(storage).deletePublic(key(alone) + ".w480.jpg");
        verify(storage, never()).deletePublic(key(shared));
    }

    @Test
    @DisplayName("the owner notice carries only the mapped reason, never free text sent alongside it")
    void noticeIgnoresFreeText() throws Exception {
        User owner = user("9860000021", "owner", null);
        User staff = staff("9860000022");
        String first = listingPhoto(owner);
        Property p = listing(owner, PropertyStatus.APPROVED, first, listingPhoto(owner));

        mvc.perform(post("/properties/" + p.getId() + "/photos/takedown")
                        .header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"photo\":\"" + first + "\",\"reason\":\"other\",\"note\":\"looks like a broker\"}"))
                .andExpect(status().isOk());

        String body = jdbc.queryForObject(
                "select body from notifications where user_id = ? and type = 'listing.photo_removed'",
                String.class, owner.getId());
        assertThat(body).doesNotContain("broker");
    }

    @Test
    @DisplayName("a photo that is not on the listing is a 404 and deletes nothing")
    void unknownPhoto() throws Exception {
        User owner = user("9860000005", "owner", null);
        User staff = staff("9860000006");
        Property p = listing(owner, PropertyStatus.APPROVED, listingPhoto(owner));

        takedown(staff, p, listingPhoto(owner), "other").andExpect(status().isNotFound());

        assertThat(audit(p)).isEmpty();
        verify(storage, never()).deletePublic(anyString());
    }

    @Test
    @DisplayName("staff cannot take a photo off their own listing")
    void ownListingRefused() throws Exception {
        User staff = staff("9860000007");
        Property p = listing(staff, PropertyStatus.APPROVED, listingPhoto(staff), listingPhoto(staff));

        takedown(staff, p, p.getImages().get(0), "other").andExpect(status().isForbidden());

        assertThat(properties.findById(p.getId()).orElseThrow().getImages()).hasSize(2);
        assertThat(audit(p)).isEmpty();
    }

    @Test
    @DisplayName("removing the last photo sends an approved listing back to needs changes")
    void lastPhotoSendsItBack() throws Exception {
        User owner = user("9860000008", "owner", null);
        User staff = staff("9860000009");
        String only = listingPhoto(owner);
        Property p = listing(owner, PropertyStatus.APPROVED, only);

        takedown(staff, p, only, "not_the_property").andExpect(status().isOk());

        Property after = properties.findById(p.getId()).orElseThrow();
        assertThat(after.getImages()).isEmpty();
        assertThat(after.getStatus()).isEqualTo(PropertyStatus.PENDING);
        assertThat(after.isAwaitingOwnerInfo()).isTrue();
        assertThat(reviews.findByPropertyId(p.getId()).orElseThrow().getStatus()).isEqualTo("needs_info");
        assertThat(jdbc.queryForObject("select body from notifications where user_id = ?"
                + " and type = 'listing.photo_removed'", String.class, owner.getId())).contains("add a photo");
    }

    @Test
    @DisplayName("a reason outside the short list is refused before anything changes")
    void badReason() throws Exception {
        User owner = user("9860000010", "owner", null);
        User staff = staff("9860000011");
        String only = listingPhoto(owner);
        Property p = listing(owner, PropertyStatus.APPROVED, only, listingPhoto(owner));

        takedown(staff, p, only, "because").andExpect(status().isBadRequest());
        takedown(staff, p, only, "").andExpect(status().is4xxClientError());

        assertThat(properties.findById(p.getId()).orElseThrow().getImages()).hasSize(2);
        assertThat(audit(p)).isEmpty();
    }

    @Test
    @DisplayName("buyers and verifiers without the moderation desk are refused")
    void authz() throws Exception {
        User owner = user("9860000012", "owner", null);
        User buyer = user("9860000013", "buyer", null);
        User verifier = user("9860000014", "staff", "[\"propertyVerification\"]");
        String only = listingPhoto(owner);
        Property p = listing(owner, PropertyStatus.APPROVED, only, listingPhoto(owner));

        takedown(buyer, p, only, "other").andExpect(status().isForbidden());
        takedown(owner, p, only, "other").andExpect(status().isForbidden());
        takedown(verifier, p, only, "other").andExpect(status().isForbidden());

        assertThat(properties.findById(p.getId()).orElseThrow().getImages()).hasSize(2);
    }
}
