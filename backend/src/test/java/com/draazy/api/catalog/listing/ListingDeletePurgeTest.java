package com.draazy.api.catalog.listing;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.photo.ListingPhotoFiles;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.FileStorage;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.context.transaction.AfterTransaction;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@DisplayName("Owner delete — blocked by open work, then the content and photos go after the undo window")
class ListingDeletePurgeTest extends AbstractApiTest {

    private static final String PREFIX = "/api/dev/storage/public/";

    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired ListingContentPurge purge;
    @MockitoSpyBean FileStorage storage;

    private final List<String> listingIds = new ArrayList<>();

    @BeforeEach
    void pinPublicPrefix() {
        doReturn(PREFIX).when(storage).publicUrlPrefix();
    }

    // Audit rows commit through REQUIRES_NEW, so the test's rollback does not take them with it.
    @AfterTransaction
    void removeAuditRowsThatEscapedRollback() {
        jdbc.update("delete from audit_log where entity = 'property' and entity_id = any (?)",
                (Object) listingIds.toArray(String[]::new));
    }

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Purge " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner, String... photos) {
        Property p = new Property(owner, "Purge flat", "rent", "apartment", 28000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("950"));
        p.setStatus(PropertyStatus.APPROVED);
        p.setLocalitySlug("baner");
        p.setPincode("411045");
        p.setDescription("Sunny two-bedroom near the hills");
        p.setAddress("Flat 4, Green Acres, Baner");
        p.setImages(List.of(photos));
        Property saved = properties.saveAndFlush(p);
        listingIds.add(saved.getId().toString());
        return saved;
    }

    private ResultActions deleteAs(User owner, Property p) throws Exception {
        return mvc.perform(delete("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(owner)));
    }

    private Map<String, Object> row(Property p) {
        properties.flush();
        return jdbc.queryForMap("select * from properties where id = ?", p.getId());
    }

    private void commitSideEffects() {
        TransactionSynchronizationManager.getSynchronizations().stream()
                .filter(sync -> sync.getClass().getName().startsWith(ListingPhotoFiles.class.getName()))
                .forEach(TransactionSynchronization::afterCommit);
    }

    private String key(String url) {
        return url.substring(PREFIX.length());
    }

    @Test
    @DisplayName("deleting archives the listing, schedules the purge 30 days out and returns pending contacts")
    void deleteSchedulesPurgeAndReturnsContacts() throws Exception {
        User owner = user("9862000001", "owner");
        User seeker = user("9862000002", "buyer");
        Property p = listing(owner, listingPhoto(owner));
        jdbc.update("insert into contact_requests (property_id, requester_id, status) values (?, ?, 'pending')",
                p.getId(), seeker.getId());

        deleteAs(owner, p).andExpect(status().isOk());

        Map<String, Object> after = row(p);
        assertThat(after.get("archived")).isEqualTo(true);
        assertThat(after.get("archive_reason")).isEqualTo(Property.OWNER_DELETE_REASON);
        assertThat(((Timestamp) after.get("purge_after")).toInstant())
                .isCloseTo(Instant.now().plus(30, ChronoUnit.DAYS), within(1, ChronoUnit.MINUTES));
        assertThat(jdbc.queryForObject("select status from contact_requests where property_id = ?",
                String.class, p.getId())).isEqualTo("expired");
        assertThat(jdbc.queryForObject("select body from notifications where user_id = ? and type = 'contact.returned'",
                String.class, seeker.getId())).contains("was taken down");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"deal", "offer", "finalization", "service"})
    @DisplayName("open work on the listing refuses the delete and leaves it live")
    void openWorkBlocksTheDelete(String kind) throws Exception {
        User owner = user("9862000011", "owner");
        User other = user("9862000012", "buyer");
        Property p = listing(owner, listingPhoto(owner));
        switch (kind) {
            case "deal" -> jdbc.update("update properties set deal_status = 'reserved' where id = ?", p.getId());
            case "offer" -> jdbc.update("insert into offers (property_id, from_user_id, amount, status)"
                    + " values (?, ?, 27000, 'countered')", p.getId(), other.getId());
            case "finalization" -> jdbc.update("insert into finalization_requests (property_id, initiator_id,"
                    + " counterparty_id, agreed_price) values (?, ?, ?, 27000)", p.getId(), owner.getId(), other.getId());
            default -> jdbc.update("insert into service_requests (requester_id, type, team, status, property_id)"
                    + " values (?, 'packers', 'packers', 'in-progress', ?)", owner.getId(), p.getId());
        }

        deleteAs(owner, p).andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_has_open_work"));

        assertThat(row(p).get("archived")).isEqualTo(false);
    }

    @Test
    @DisplayName("an unpaid service request does not block the delete")
    void unpaidServiceDoesNotBlock() throws Exception {
        User owner = user("9862000021", "owner");
        Property p = listing(owner, listingPhoto(owner));
        jdbc.update("insert into service_requests (requester_id, type, team, status, property_id)"
                + " values (?, 'packers', 'packers', 'awaiting-payment', ?)", owner.getId(), p.getId());

        deleteAs(owner, p).andExpect(status().isOk());
    }

    @Test
    @DisplayName("the purge clears the content, keeps the row, and deletes only files nothing else shows")
    void purgeClearsContentAndUnsharedFiles() throws Exception {
        User owner = user("9862000031", "owner");
        String alone = listingPhoto(owner);
        String shared = listingPhoto(owner);
        Property p = listing(owner, alone, shared);
        listing(owner, shared);
        deleteAs(owner, p).andExpect(status().isOk());
        jdbc.update("update properties set purge_after = now() - interval '1 minute' where id = ?", p.getId());

        assertThat(purge.purgeDue(Instant.now())).isPositive();
        commitSideEffects();

        Map<String, Object> after = row(p);
        assertThat(after.get("content_purged_at")).isNotNull();
        assertThat(after.get("description")).isNull();
        assertThat(after.get("address")).isNull();
        assertThat(after.get("images").toString()).isEqualTo("[]");
        assertThat(after.get("pincode")).isEqualTo("411045");
        assertThat(after.get("price")).isEqualTo(28000L);
        verify(storage).deletePublic(key(alone));
        verify(storage, never()).deletePublic(key(shared));
    }

    @Test
    @DisplayName("a listing within its undo window is not purged")
    void notDueIsKept() throws Exception {
        User owner = user("9862000041", "owner");
        Property p = listing(owner, listingPhoto(owner));
        deleteAs(owner, p).andExpect(status().isOk());

        purge.purgeDue(Instant.now());
        commitSideEffects();

        assertThat(row(p).get("content_purged_at")).isNull();
        verify(storage, never()).deletePublic(anyString());
    }

    @Test
    @DisplayName("staff archiving an owner-deleted listing keeps it as evidence; a purged one cannot be restored")
    void staffArchiveKeepsAndPurgedRestoreRefused() throws Exception {
        User owner = user("9862000051", "owner");
        User staff = user("9862000052", "staff");
        Property kept = listing(owner, listingPhoto(owner));
        deleteAs(owner, kept).andExpect(status().isOk());

        mvc.perform(patch("/properties/" + kept.getId() + "/archive").header(HttpHeaders.AUTHORIZATION, bearer(staff))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Fraud review\"}"))
                .andExpect(status().isOk());
        assertThat(row(kept).get("purge_after")).isNull();

        Property gone = listing(owner, listingPhoto(owner));
        deleteAs(owner, gone).andExpect(status().isOk());
        jdbc.update("update properties set purge_after = now() - interval '1 minute' where id = ?", gone.getId());
        purge.purgeDue(Instant.now());

        mvc.perform(patch("/properties/" + gone.getId() + "/restore").header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("listing_content_purged"));
    }

    @Test
    @DisplayName("chats about a deleted listing turn read-only for both sides")
    void deleteClosesChats() throws Exception {
        User owner = user("9862000071", "owner");
        User seeker = user("9862000072", "buyer");
        Property p = listing(owner, listingPhoto(owner));
        String chat = jdbc.queryForObject("insert into conversations (user_a_id, user_b_id, property_id)"
                + " values (least(?::uuid, ?::uuid), greatest(?::uuid, ?::uuid), ?) returning id::text", String.class,
                owner.getId(), seeker.getId(), owner.getId(), seeker.getId(), p.getId());
        deleteAs(owner, p).andExpect(status().isOk());

        for (User side : List.of(owner, seeker)) {
            mvc.perform(post("/messages/" + chat + "/reply").header(HttpHeaders.AUTHORIZATION, bearer(side))
                            .contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Still available?\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value("conversation_closed"));
        }
        mvc.perform(get("/messages/" + chat).header(HttpHeaders.AUTHORIZATION, bearer(seeker)))
                .andExpect(jsonPath("$.listingDeleted").value(true));
    }

    @Test
    @DisplayName("an edit that drops a photo deletes its file after commit")
    void editDeletesDroppedPhoto() throws Exception {
        User owner = user("9862000061", "owner");
        String dropped = listingPhoto(owner);
        String kept = listingPhoto(owner);
        Property p = listing(owner, dropped, kept);

        mvc.perform(patch("/me/listings/" + p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"images\":[\"" + kept + "\"]}"))
                .andExpect(status().isOk());
        commitSideEffects();

        verify(storage).deletePublic(key(dropped));
        verify(storage, never()).deletePublic(key(kept));
    }
}
