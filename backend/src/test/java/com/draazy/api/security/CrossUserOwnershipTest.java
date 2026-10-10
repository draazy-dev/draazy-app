package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.leads.contact.ContactRequest;
import com.draazy.api.leads.contact.ContactRequestRepository;
import com.draazy.api.leads.contact.ContactRequestStatuses;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@DisplayName("Cross-user ownership — a second account cannot touch the first one's records")
class CrossUserOwnershipTest extends AbstractSecurityTest {

    private static final String OWNER = "owner";
    private static final String BUYER = "buyer";

    @Autowired
    PropertyRepository properties;
    @Autowired
    ContactRequestRepository contactRequests;

    private Property listing(User owner, String status) {
        Property p = new Property(owner, "2BHK in Kothrud", "rent", "apartment", 25000L, "Kothrud", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("1000"));
        p.setStatus(status);
        return properties.saveAndFlush(p);
    }

@Test
    @DisplayName("PATCH /me/listings/{id} by another owner is a 404 and the listing row is unchanged")
    void patchingSomeoneElsesListing() throws Exception {
        User a = user("9898000001", OWNER);
        User b = user("9898000002", OWNER);
        Property p = listing(a, PropertyStatus.APPROVED);
        String before = row("properties", p.getId());

        mvc.perform(patch(Routes.MeListings.BY_ID, p.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(b)).contentType(JSON)
                        .content("{\"title\":\"Hijacked\",\"price\":1}"))
                .andExpect(status().isNotFound());

        assertThat(row("properties", p.getId())).isEqualTo(before);
    }

    @Test
    @DisplayName("POST /me/listings/{id}/resume by another owner is a 404 and the listing stays paused")
    void resumingSomeoneElsesListing() throws Exception {
        User a = user("9898000003", OWNER);
        User b = user("9898000004", OWNER);
        Property p = listing(a, PropertyStatus.PAUSED);
        String before = row("properties", p.getId());

        mvc.perform(post(Routes.MeListings.RESUME, p.getId()).header(HttpHeaders.AUTHORIZATION, bearer(b)))
                .andExpect(status().isNotFound());

        assertThat(row("properties", p.getId())).isEqualTo(before);
    }

    private String addTransaction(User owner, Property p) throws Exception {
        String json = mvc.perform(post(Routes.Finances.TRANSACTIONS, p.getId())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)).contentType(JSON)
                        .content("{\"type\":\"income\",\"category\":\"Rent\",\"amount\":250000,\"date\":\""
                                + LocalDate.now(PlatformTime.IST) + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return idOf(json);
    }

    @ParameterizedTest(name = "{0} with {1} ledger path is a 404 and the transaction is unchanged")
    @CsvSource({"PATCH,the owner's", "PATCH,the caller's own", "DELETE,the owner's", "DELETE,the caller's own"})
    @DisplayName("another owner cannot edit or delete a ledger transaction")
    void touchingSomeoneElsesTransaction(String method, String ledger) throws Exception {
        User a = user("9898000005", OWNER);
        User b = user("9898000006", OWNER);
        Property theirs = listing(a, PropertyStatus.APPROVED);
        Property mine = listing(b, PropertyStatus.APPROVED);
        String txn = addTransaction(a, theirs);
        String before = row("transactions", uuid(txn));
        Property pathProperty = ledger.startsWith("the owner") ? theirs : mine;

        MockHttpServletRequestBuilder request = "PATCH".equals(method)
                ? patch(Routes.Finances.TRANSACTION_BY_ID, pathProperty.getId(), txn)
                        .contentType(JSON).content("{\"amount\":1,\"note\":\"tampered\"}")
                : delete(Routes.Finances.TRANSACTION_BY_ID, pathProperty.getId(), txn);
        mvc.perform(request.header(HttpHeaders.AUTHORIZATION, bearer(b))).andExpect(status().isNotFound());

        assertThat(row("transactions", uuid(txn))).isEqualTo(before);
    }

    @Test
    @DisplayName("DELETE /me/documents/managed/{managedId}/{docId} by another owner is a 404 and the document stays")
    void deletingSomeoneElsesManagedDocument() throws Exception {
        User a = user("9898000007", OWNER);
        User b = user("9898000008", OWNER);
        String managedId = idOf(mvc.perform(post(Routes.MeManagedProperties.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(a)).contentType(JSON)
                        .content("{\"deal\":\"rent\",\"propertyType\":\"Flat\",\"bhk\":2,"
                                + "\"price\":25000,\"locality\":\"Baner\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String docId = idOf(mvc.perform(multipart(Routes.MeDocuments.FOR_MANAGED, managedId)
                        .file(new MockMultipartFile("file", "deed.pdf", "application/pdf", "%PDF-1.4 deed".getBytes()))
                        .param("category", "Sale Deed")
                        .header(HttpHeaders.AUTHORIZATION, bearer(a)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String before = row("managed_property_documents", uuid(docId));

        mvc.perform(delete(Routes.MeDocuments.MANAGED_BY_ID, managedId, docId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(b)))
                .andExpect(status().isNotFound());

        assertThat(count("select count(*) from managed_property_documents where id = ?::uuid", docId))
                .isEqualTo(1);
        assertThat(row("managed_property_documents", uuid(docId))).isEqualTo(before);
    }

    private record Probe(String label, Function<String, MockHttpServletRequestBuilder> request, int expected) {
        @Override
        public String toString() {
            return label;
        }
    }

    static Stream<Probe> serviceRequestRoutes() {
        return Stream.of(
                new Probe("POST checkout", id -> post(Routes.ServiceRequests.CHECKOUT, id), 404),
                new Probe("PUT party-details", id -> put(Routes.ServiceRequests.PARTY_DETAILS, id)
                        .contentType(JSON).content("{\"details\":{\"tenants\":\"Intruder\"}}"), 404),
                new Probe("POST parties", id -> post(Routes.ServiceRequests.PARTIES, id)
                        .contentType(JSON).content("{\"role\":\"tenant\",\"mobile\":\"9898009999\"}"), 404),
                new Probe("POST read", id -> post(Routes.ServiceRequests.READ, id), 404));
    }

    @ParameterizedTest(name = "{0} by another customer is refused and the request is unchanged")
    @MethodSource("serviceRequestRoutes")
    @DisplayName("service-request sub-resources are scoped to the requester")
    void touchingSomeoneElsesServiceRequest(Probe probe) throws Exception {
        User a = user("9898000009", BUYER);
        User b = user("9898000010", BUYER);
        Property p = listing(a, PropertyStatus.APPROVED);
        String id = idOf(mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(a)).contentType(JSON)
                        .content("{\"type\":\"rent-agreement\",\"propertyId\":\"" + p.getId() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
        String before = row("service_requests", uuid(id));

        mvc.perform(probe.request().apply(id).header(HttpHeaders.AUTHORIZATION, bearer(b)))
                .andExpect(status().is(probe.expected()));

        assertThat(row("service_requests", uuid(id))).isEqualTo(before);
        assertThat(count("select count(*) from service_request_parties where request_id = ?::uuid", id)).isZero();
    }

    private String startConversation(User buyer, User owner, Property p) throws Exception {
        ContactRequest cr = new ContactRequest(p.getId(), buyer.getId(), "interested");
        cr.setStatus(ContactRequestStatuses.APPROVED);
        contactRequests.saveAndFlush(cr);
        return idOf(mvc.perform(post(Routes.Conversations.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer)).contentType(JSON)
                        .content("{\"counterpartyMobile\":\"" + owner.getMobile() + "\",\"propertyId\":\""
                                + p.getId() + "\",\"body\":\"hello\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString());
    }

    private List<Map<String, Object>> threadState(String conversationId) {
        em.flush();
        return jdbc.queryForList("select user_id, archived, muted from conversation_user_state "
                + "where conversation_id = ?::uuid order by user_id", conversationId);
    }

    @Test
    @DisplayName("PATCH /messages/{id}/state by a non-participant is a 404 and the thread state is unchanged")
    void changingStateOfSomeoneElsesThread() throws Exception {
        User owner = user("9898000011", OWNER);
        User buyer = user("9898000012", BUYER);
        User outsider = user("9898000013", BUYER);
        String id = startConversation(buyer, owner, listing(owner, PropertyStatus.APPROVED));
        mvc.perform(patch(Routes.Conversations.STATE, id).header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(JSON).content("{\"archived\":true}"))
                .andExpect(status().isNoContent());
        List<Map<String, Object>> before = threadState(id);

        mvc.perform(patch(Routes.Conversations.STATE, id).header(HttpHeaders.AUTHORIZATION, bearer(outsider))
                        .contentType(JSON).content("{\"archived\":false,\"muted\":true}"))
                .andExpect(status().isNotFound());

        assertThat(threadState(id)).isEqualTo(before).hasSize(1);
    }

    @Test
    @DisplayName("POST /messages/{id}/block by a non-participant is a 404 and no block is recorded")
    void blockingInSomeoneElsesThread() throws Exception {
        User owner = user("9898000014", OWNER);
        User buyer = user("9898000015", BUYER);
        User outsider = user("9898000016", BUYER);
        String id = startConversation(buyer, owner, listing(owner, PropertyStatus.APPROVED));
        String blocks = "select count(*) from user_blocks where blocker_id in (?, ?, ?) or blocked_id in (?, ?, ?)";
        Object[] everyone = {owner.getId(), buyer.getId(), outsider.getId(),
                owner.getId(), buyer.getId(), outsider.getId()};

        mvc.perform(post(Routes.Conversations.BLOCK, id).header(HttpHeaders.AUTHORIZATION, bearer(outsider)))
                .andExpect(status().isNotFound());

        assertThat(count(blocks, everyone)).isZero();
    }

    private UUID notificationFor(User user) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into notifications (id, user_id, type, title) values (?, ?, 'info', 'For the owner')",
                id, user.getId());
        return id;
    }

    @Test
    @DisplayName("POST /notifications/read with another user's ids leaves their notification unread")
    void markingSomeoneElsesNotificationsRead() throws Exception {
        User a = user("9898000017", BUYER);
        User b = user("9898000018", BUYER);
        UUID theirs = notificationFor(a);
        String before = row("notifications", theirs);

        mvc.perform(post(Routes.Engagement.NOTIFICATIONS_READ).header(HttpHeaders.AUTHORIZATION, bearer(b))
                        .contentType(JSON).content("{\"ids\":[\"" + theirs + "\"]}"))
                .andExpect(status().isNoContent());

        assertThat(row("notifications", theirs)).isEqualTo(before);
        assertThat(count("select count(*) from notifications where id = ? and read = false", theirs)).isEqualTo(1);
    }

    @Test
    @DisplayName("POST /notifications/dismiss with another user's ids leaves their notification in place")
    void dismissingSomeoneElsesNotifications() throws Exception {
        User a = user("9898000019", BUYER);
        User b = user("9898000020", BUYER);
        UUID theirs = notificationFor(a);
        String before = row("notifications", theirs);

        mvc.perform(post(Routes.Engagement.NOTIFICATIONS_DISMISS).header(HttpHeaders.AUTHORIZATION, bearer(b))
                        .contentType(JSON).content("{\"ids\":[\"" + theirs + "\"]}"))
                .andExpect(status().isNoContent());

        assertThat(count("select count(*) from notifications where id = ?", theirs)).isEqualTo(1);
        assertThat(row("notifications", theirs)).isEqualTo(before);
    }
}
