package com.draazy.api.deals.finalization;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.deals.deal.DealStatuses;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.JwtService;
import java.math.BigDecimal;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

class FinalizationEndpointsTest extends AbstractApiTest {
    @Autowired MockMvc mvc;
    @Autowired JwtService jwtService;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired FinalizationRequestRepository finalizationRepo;
    @Autowired JdbcTemplate jdbc;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Test " + mobile.substring(6));
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

    private String requestFinalization(User initiator, Property p, User counterparty,
                                        long price) throws Exception {
        String body = "{\"counterpartyMobile\":\"" + counterparty.getMobile()
                + "\",\"agreedPrice\":" + price + "}";
        MvcResult result = mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(initiator))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();
        return extractId(result);
    }

    private String extractId(MvcResult result) throws Exception {
        String json = result.getResponse().getContentAsString();
        return json.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");
    }

    @Test
    void requestFinalization_registeredCounterparty_returns200Pending() throws Exception {
        User owner = user("9830100001", "owner");
        User buyer = user("9830100002", "buyer");
        Property p = listing(owner, "Finalization test");
        long largeAmount = 3_000_000_000L;

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"counterpartyMobile\":\"" + owner.getMobile()
                                + "\",\"agreedPrice\":" + largeAmount + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.propertyId").value(p.getId().toString()))
                .andExpect(jsonPath("$.agreedPrice").value(largeAmount))
                .andExpect(jsonPath("$.status").value(FinalizationStatuses.PENDING))
                .andExpect(jsonPath("$.initiator.id").value(buyer.getId().toString()))
                .andExpect(jsonPath("$.counterparty.id").value(owner.getId().toString()));
    }

    @Test
    void requestFinalization_unregisteredMobile_returns400() throws Exception {
        User owner = user("9830100003", "owner");
        User buyer = user("9830100004", "buyer");
        Property p = listing(owner, "Unregistered test");

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"counterpartyMobile\":\"9999999999\",\"agreedPrice\":5000000}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(
                        org.hamcrest.Matchers.containsString("listing owner")));
    }

    @Test
    void requestFinalization_bodyPropertyIdMismatch_returns400() throws Exception {
        User owner = user("9830100005", "owner");
        User buyer = user("9830100006", "buyer");
        Property p = listing(owner, "Mismatch test");

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + UUID.randomUUID()
                                + "\",\"counterpartyMobile\":\"" + owner.getMobile()
                                + "\",\"agreedPrice\":5000000}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void acceptFinalization_autoDeclinesSiblingsAndClosesDeal() throws Exception {
        User owner = user("9830100007", "owner");
        User buyer1 = user("9830100008", "buyer");
        User buyer2 = user("9830100009", "buyer");
        User buyer3 = user("9830100010", "buyer");
        Property p = listing(owner, "Auto-decline test");

        String reqId1 = requestFinalization(buyer1, p, owner, 5000000L);
        String reqId2 = requestFinalization(buyer2, p, owner, 5500000L);
        String reqId3 = requestFinalization(buyer3, p, owner, 6000000L);

        mvc.perform(post("/finalization/requests/" + reqId2 + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        assertThat(finalizationRepo.findById(UUID.fromString(reqId2)).orElseThrow().getStatus())
                .isEqualTo(FinalizationStatuses.ACCEPTED);
        assertThat(finalizationRepo.findById(UUID.fromString(reqId1)).orElseThrow().getStatus())
                .isEqualTo(FinalizationStatuses.DECLINED);
        assertThat(finalizationRepo.findById(UUID.fromString(reqId3)).orElseThrow().getStatus())
                .isEqualTo(FinalizationStatuses.DECLINED);

        String dealStatus = jdbc.queryForObject(
                "SELECT status FROM deals WHERE property_id = ?",
                String.class, p.getId());
        assertThat(dealStatus).isEqualTo(DealStatuses.CLOSED);
    }

    @Test
    void acceptFinalization_dealAlreadyClosed_rollsBackEverything() throws Exception {
        User owner = user("9830100011", "owner");
        User buyer1 = user("9830100012", "buyer");
        User buyer2 = user("9830100013", "buyer");
        Property p = listing(owner, "Atomicity test");

        String reqId1 = requestFinalization(buyer1, p, owner, 5000000L);
        String reqId2 = requestFinalization(buyer2, p, owner, 5500000L);

        jdbc.update("INSERT INTO deals (id, property_id, deal, status) VALUES (?, ?, 'rent', 'closed')",
                UUID.randomUUID(), p.getId());

        mvc.perform(post("/finalization/requests/" + reqId1 + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());

        assertThat(finalizationRepo.findById(UUID.fromString(reqId1)).orElseThrow().getStatus())
                .isEqualTo(FinalizationStatuses.PENDING);
        assertThat(finalizationRepo.findById(UUID.fromString(reqId2)).orElseThrow().getStatus())
                .isEqualTo(FinalizationStatuses.PENDING);
    }

    @Test
    void initiatorCannotAcceptOwnRequest() throws Exception {
        User owner = user("9830100014", "owner");
        User buyer = user("9830100015", "buyer");
        Property p = listing(owner, "Self-accept test");

        String reqId = requestFinalization(buyer, p, owner, 5000000L);

        mvc.perform(post("/finalization/requests/" + reqId + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isForbidden());

        assertThat(finalizationRepo.findById(UUID.fromString(reqId)).orElseThrow().getStatus())
                .isEqualTo(FinalizationStatuses.PENDING);
    }

    @Test
    void stranger_allOperations_return404() throws Exception {
        User owner = user("9830100016", "owner");
        User buyer = user("9830100017", "buyer");
        User stranger = user("9830100018", "buyer");
        Property p = listing(owner, "Stranger test");

        String reqId = requestFinalization(buyer, p, owner, 5000000L);

        mvc.perform(post("/finalization/requests/" + reqId + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());

        mvc.perform(post("/finalization/requests/" + reqId + "/decline")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isNotFound());

        mvc.perform(get("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNoContent());

        mvc.perform(delete("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
    }

    @Test
    void cancelFinalization_returns204_softTransition() throws Exception {
        User owner = user("9830100019", "owner");
        User buyer = user("9830100020", "buyer");
        Property p = listing(owner, "Cancel test");

        String reqId = requestFinalization(buyer, p, owner, 5000000L);

        mvc.perform(delete("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isNoContent());

        Integer count = jdbc.queryForObject(
                "SELECT count(*) FROM finalization_requests WHERE id = ?::uuid AND status = 'cancelled'",
                Integer.class, reqId);
        assertThat(count).isEqualTo(1);
    }

    @Test
    void statusAfterDecline_returnsDeclinedRow() throws Exception {
        User owner = user("9830100031", "owner");
        User buyer = user("9830100032", "buyer");
        Property p = listing(owner, "Declined status test");

        String reqId = requestFinalization(buyer, p, owner, 5000000L);

        mvc.perform(post("/finalization/requests/" + reqId + "/decline")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mvc.perform(get("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(FinalizationStatuses.DECLINED));
    }

    @Test
    void myFinalizationRequests_returnsOnlyCallersRequests() throws Exception {
        User owner1 = user("9830100021", "owner");
        User owner2 = user("9830100022", "owner");
        User buyer = user("9830100023", "buyer");
        Property p1 = listing(owner1, "My req 1");
        Property p2 = listing(owner2, "My req 2");

        requestFinalization(buyer, p1, owner1, 5000000L);
        requestFinalization(buyer, p2, owner2, 6000000L);

        mvc.perform(get(Routes.Finalization.ME_REQUESTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner1)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].propertyId").value(p1.getId().toString()));

        mvc.perform(get(Routes.Finalization.ME_REQUESTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner2)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].propertyId").value(p2.getId().toString()));
    }

    @Test
    void myFinalizationRequests_propertyIdNarrowsToThatListing() throws Exception {
        User owner = user("9830100150", "owner");
        Property p1 = listing(owner, "Fin narrow one");
        Property p2 = listing(owner, "Fin narrow two");
        requestFinalization(user("9830100151", "buyer"), p1, owner, 5000000L);
        requestFinalization(user("9830100152", "buyer"), p2, owner, 5100000L);

        mvc.perform(get(Routes.Finalization.ME_REQUESTS).param("propertyId", p2.getId().toString())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.content[0].propertyId").value(p2.getId().toString()));
    }

    @Test
    void myFinalizationRequests_isPaged_andTheTotalCountsOnlyPendingRows() throws Exception {
        User owner = user("9830100040", "owner");
        Property p1 = listing(owner, "Fin paging A");
        Property p2 = listing(owner, "Fin paging B");
        Property p3 = listing(owner, "Fin paging C");
        Property p4 = listing(owner, "Fin paging D");
        requestFinalization(user("9830100041", "buyer"), p1, owner, 5000000L);
        requestFinalization(user("9830100042", "buyer"), p2, owner, 5100000L);
        requestFinalization(user("9830100043", "buyer"), p3, owner, 5200000L);
        String declined = requestFinalization(user("9830100044", "buyer"), p4, owner, 5300000L);
        mvc.perform(post("/finalization/requests/" + declined + "/decline")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Finalization.ME_REQUESTS).param("page", "0").param("size", "2")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(3))
                .andExpect(jsonPath("$.totalPages").value(2));

        mvc.perform(get(Routes.Finalization.ME_REQUESTS).param("page", "1").param("size", "2")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.totalElements").value(3));
    }

    @Test
    void mobileMasking_staysMaskedToCounterparty_evenOnceAccepted() throws Exception {
        User owner = user("9830100024", "owner");
        User buyer = user("9876543210", "buyer");
        Property p = listing(owner, "Mask test");

        requestFinalization(buyer, p, owner, 5000000L);

        MvcResult pendingResult = mvc.perform(get("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.initiator.mobile").value("98XXXXX210"))
                .andReturn();

        String reqId = extractId(pendingResult);
        mvc.perform(post("/finalization/requests/" + reqId + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        FinalizationRequest accepted = finalizationRepo.findById(UUID.fromString(reqId)).orElseThrow();
        assertThat(accepted.getStatus()).isEqualTo(FinalizationStatuses.ACCEPTED);
        User buyerUser = users.findById(buyer.getId()).orElseThrow();
        FinalizationRequestDto dto = FinalizationMapper.toDto(
                accepted, buyerUser, owner, owner.getId(), Set.of());
        assertThat(dto.initiator().mobile()).isEqualTo("98XXXXX210");
    }

    @Test
    void duplicateLiveRequest_returns409() throws Exception {
        User owner = user("9830100025", "owner");
        User buyer = user("9830100026", "buyer");
        Property p = listing(owner, "Duplicate test");

        requestFinalization(buyer, p, owner, 5000000L);

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"counterpartyMobile\":\"" + owner.getMobile()
                                + "\",\"agreedPrice\":6000000}"))
                .andExpect(status().isConflict());
    }

    @Test
    void illegalTransition_acceptDeclinedRequest_returns409() throws Exception {
        User owner = user("9830100027", "owner");
        User buyer = user("9830100028", "buyer");
        Property p = listing(owner, "Illegal transition");

        String reqId = requestFinalization(buyer, p, owner, 5000000L);

        mvc.perform(post("/finalization/requests/" + reqId + "/decline")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        mvc.perform(post("/finalization/requests/" + reqId + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict());
    }

    @Test
    void cannotAimAFinalizationRequestAtSomeoneWhoIsNotTheOwner() throws Exception {
        User owner = user("9820100091", "owner");
        User buyer = user("9820100092", "buyer");
        User bystander = user("9820100093", "buyer");
        Property p = listing(owner, "Inbox pollution test");

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"counterpartyMobile\":\"" + bystander.getMobile()
                                + "\",\"agreedPrice\":5000000}"))
                .andExpect(status().isBadRequest());

        mvc.perform(get(Routes.Finalization.ME_REQUESTS)
                        .header(HttpHeaders.AUTHORIZATION, bearer(bystander)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.totalElements").value(0));
    }

    @Test
    void wrongMobileAndUnregisteredMobileAreIndistinguishable() throws Exception {
        User owner = user("9820100094", "owner");
        User buyer = user("9820100095", "buyer");
        User registeredStranger = user("9820100096", "buyer");
        Property p = listing(owner, "Enumeration oracle test");

        String registeredBody = "{\"counterpartyMobile\":\"" + registeredStranger.getMobile()
                + "\",\"agreedPrice\":5000000}";
        String unregisteredBody = "{\"counterpartyMobile\":\"9000000000\",\"agreedPrice\":5000000}";

        String registeredResponse = mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON).content(registeredBody))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();

        String unregisteredResponse = mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON).content(unregisteredBody))
                .andExpect(status().isBadRequest())
                .andReturn().getResponse().getContentAsString();

        assertThat(messageOf(registeredResponse)).isEqualTo(messageOf(unregisteredResponse));
        assertThat(errorOf(registeredResponse)).isEqualTo(errorOf(unregisteredResponse));
    }

    private static String messageOf(String json) {
        return json.replaceAll("^.*\"message\":\"([^\"]*)\".*$", "$1");
    }

    private static String errorOf(String json) {
        return json.replaceAll("^.*\"error\":\"([^\"]*)\".*$", "$1");
    }

    @Test
    void requestFinalization_onAListingThatIsNotLive_is404LikeThePublicRead() throws Exception {
        User owner = user("9830100071", "owner");
        User buyer = user("9830100072", "buyer");
        for (String state : List.of("pending", "rejected", "flagged", "paused", "archived")) {
            Property p = listing(owner, "Not live " + state);
            if ("archived".equals(state)) {
                p.archive("Taken down by the owner");
            } else {
                p.setStatus(state);
            }
            properties.saveAndFlush(p);

            mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                            .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"counterpartyMobile\":\"" + owner.getMobile()
                                    + "\",\"agreedPrice\":5000000}"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("not_found"));
        }
    }

    private void ownerAcceptsOffer(User owner, User buyer, Property p, long amount) throws Exception {
        MvcResult offer = mvc.perform(post(Routes.Offers.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"propertyId\":\"" + p.getId() + "\",\"amount\":" + amount + "}"))
                .andExpect(status().isCreated())
                .andReturn();
        mvc.perform(post(Routes.Offers.BASE + "/" + extractId(offer) + "/respond")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"action\":\"accept\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void statusWithNoRequest_is204NotAnError() throws Exception {
        User owner = user("9830100081", "owner");
        User buyer = user("9830100082", "buyer");
        Property p = listing(owner, "No request yet");

        mvc.perform(get("/finalization/" + p.getId() + "/status")
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer)))
                .andExpect(status().isNoContent());
    }

    @Test
    void requestAfterAcceptedOffer_usesTheOfferAmountNotTheListingPrice() throws Exception {
        User owner = user("9830100083", "owner");
        User buyer = user("9830100084", "buyer");
        Property p = listing(owner, "Offer price wins");
        ownerAcceptsOffer(owner, buyer, p, 20000L);

        mvc.perform(post(Routes.Finalization.REQUEST.replace("{propId}", p.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(buyer))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"counterpartyMobile\":\"" + owner.getMobile() + "\",\"agreedPrice\":25000}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.agreedPrice").value(20000));
    }

    @Test
    void acceptOnRentListing_opensPendingTenancyAndNotifiesTenant() throws Exception {
        User owner = user("9830100085", "owner");
        User buyer = user("9830100086", "buyer");
        Property p = listing(owner, "Tenancy from finalize");
        String reqId = requestFinalization(buyer, p, owner, 25000L);

        mvc.perform(post("/finalization/requests/" + reqId + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM tenancies WHERE property_id = ? AND tenant_id = ? AND status = 'pending'",
                Integer.class, p.getId(), buyer.getId())).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM notifications WHERE user_id = ? AND type = 'tenancy.pending'",
                Integer.class, buyer.getId())).isEqualTo(1);
    }

    @Test
    void secondAccept_isACleanConflictNotA500() throws Exception {
        User owner = user("9830100087", "owner");
        User buyer = user("9830100088", "buyer");
        Property p = listing(owner, "Double accept");
        String reqId = requestFinalization(buyer, p, owner, 25000L);

        mvc.perform(post("/finalization/requests/" + reqId + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk());
        mvc.perform(post("/finalization/requests/" + reqId + "/accept")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("This request has already been accepted."));
    }
}
