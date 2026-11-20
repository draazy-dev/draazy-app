package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.common.web.Routes;
import com.draazy.api.engagement.notification.NotificationRepository;
import com.draazy.api.identity.user.User;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("A rent agreement reuses what the platform already holds")
class RentAgreementReuseTest extends ServiceFixtures {

    @Autowired
    private NotificationRepository notifications;

    @Nested
    @DisplayName("filing a paper from the request property's vault")
    class FromVault {

        @Test
        @DisplayName("the owner's paper on this property is filed without a re-upload and reads back without a URL")
        void ownPaperIsFiled() throws Exception {
            User owner = customer("9820000801");
            Property flat = listing(owner);
            String id = create(owner, flat);
            String vaultId = propertyVaultPaper(owner, flat, "index-ii.pdf");

            fromVault(owner, id, vaultId, "ownership-proof", 201)
                    .andExpect(jsonPath("$.category").value("ownership-proof"))
                    .andExpect(jsonPath("$.fileName").value("index-ii.pdf"));
            mvc.perform(get(Routes.ServiceRequests.BY_ID, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.documents[0].category").value("ownership-proof"))
                    .andExpect(jsonPath("$.documents[0].fileName").value("index-ii.pdf"))
                    .andExpect(jsonPath("$.documents[0].url").doesNotExist());
        }

        @Test
        @DisplayName("only a vault paper on the request's own property is filed, and the desk may not file from a vault at all")
        void onlyTheRequestsProperty() throws Exception {
            User owner = customer("9820000802");
            User stranger = customer("9820000803");
            Property flat = listing(owner);
            String id = create(owner, flat);
            String otherFlat = propertyVaultPaper(owner, listing(owner), "other.pdf");
            String strangers = propertyVaultPaper(stranger, listing(stranger), "theirs.pdf");
            String copy = field(fromVault(owner, id, propertyVaultPaper(owner, flat, "index-ii.pdf"),
                    "ownership-proof", 201).andReturn().getResponse().getContentAsString(), "id");

            fromVault(owner, id, otherFlat, "licensor-0-pan", 404);
            fromVault(owner, id, strangers, "licensor-0-pan", 404);
            fromVault(owner, id, copy, "licensor-0-pan", 404);
            fromVault(owner, id, "not-a-uuid", "licensor-0-pan", 404);
            fromVault(stranger, id, strangers, "licensor-0-pan", 404);
            fromVault(stranger, create(stranger, null), strangers, "licensor-0-pan", 404);
            fromVault(admin("9820000804"), id, propertyVaultPaper(owner, flat, "pan.pdf"), "licensor-0-pan", 403);
        }

        @Test
        @DisplayName("the side rules of a direct upload hold, and a tenant cannot file the owner's property papers")
        void sideRulesHold() throws Exception {
            User owner = customer("9820000805");
            User tenant = customer("9820000806");
            Property flat = listing(owner);
            String id = create(owner, flat);
            String party = invite(owner, id, tenant, 201);
            decide(tenant, field(party, "id"), "accept");
            String index = propertyVaultPaper(owner, flat, "index-ii.pdf");

            fromVault(tenant, id, index, "ownership-proof", 403);
            fromVault(tenant, id, index, "tenant-0-pan", 404);
            fromVault(owner, id, index, "draft", 422);
        }
    }

    @Nested
    @DisplayName("a declined invitation")
    class Declined {

        @Test
        @DisplayName("frees the side for somebody else, but not for the person who declined")
        void clearAndReinvite() throws Exception {
            User owner = customer("9820000811");
            User first = customer("9820000812");
            User second = customer("9820000813");
            String id = create(owner);
            String partyId = field(invite(owner, id, first, 201), "id");
            decide(first, partyId, "decline");

            withdraw(first, id, partyId, 404);
            withdraw(owner, id, partyId, 204);
            invite(owner, id, first, 409);
            String again = field(invite(owner, id, second, 201), "id");
            decide(second, again, "accept");
            withdraw(owner, id, again, 409);
        }
    }

    @Nested
    @DisplayName("the counterparty finishing their half")
    class CounterpartyDone {

        @Test
        @DisplayName("tells the requester, who alone can open checkout, and nobody else")
        void requesterIsTold() throws Exception {
            User owner = customer("9820000821");
            User tenant = customer("9820000822");
            String id = create(owner);
            decide(tenant, field(invite(owner, id, tenant, 201), "id"), "accept");
            assertThat(notifications.findAll())
                    .filteredOn(n -> "service.party-invited".equals(n.getType()))
                    .filteredOn(n -> n.getUserId().equals(owner.getId()) || n.getUserId().equals(tenant.getId()))
                    .singleElement()
                    .satisfies(n -> {
                        assertThat(n.getUserId()).isEqualTo(tenant.getId());
                        assertThat(n.getTitle()).startsWith("You were added as the ");
                        assertThat(n.getLink()).startsWith("/services/rent-agreement?party=")
                                .endsWith("&request=" + id);
                    });

            mvc.perform(put(Routes.ServiceRequests.PARTY_DETAILS, id)
                            .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"details\":{\"_state\":{\"owner\":{\"oMobile\":\"9820000821\"},"
                                    + "\"tenants\":[{\"name\":\"Ria\",\"mobile\":\"9820000822\"}]}}}"))
                    .andExpect(status().isOk());

            assertThat(notifications.findAll())
                    .filteredOn(n -> "service.party-details-submitted".equals(n.getType()))
                    .filteredOn(n -> n.getUserId().equals(owner.getId()) || n.getUserId().equals(tenant.getId()))
                    .singleElement()
                    .satisfies(n -> {
                        assertThat(n.getUserId()).isEqualTo(owner.getId());
                        assertThat(n.getLink()).isEqualTo("/services/rent-agreement");
                    });
        }
    }

    private String create(User owner) throws Exception {
        return create(owner, null);
    }

    private String create(User owner, Property property) throws Exception {
        String listing = property == null ? "" : ",\"propertyId\":\"" + property.getId() + "\"";
        String body = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"rent-agreement\"" + listing + ",\"details\":{\"_state\":"
                                + "{\"owner\":{\"oMobile\":\"" + owner.getMobile() + "\"}}}}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(body, "id");
    }

    private ResultActions fromVault(User caller, String id, String documentId, String category, int expected)
            throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.DOCS_FROM_VAULT, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"documentId\":\"" + documentId + "\",\"category\":\"" + category + "\"}"))
                .andExpect(status().is(expected));
    }

    private String invite(User owner, String id, User invitee, int expected) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.PARTIES, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"tenant\",\"mobile\":\"" + invitee.getMobile() + "\"}"))
                .andExpect(status().is(expected))
                .andReturn().getResponse().getContentAsString();
    }

    private void decide(User invitee, String partyId, String decision) throws Exception {
        mvc.perform(post(Routes.ServiceRequests.INVITE_DECISION, partyId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(invitee))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"" + decision + "\"}"))
                .andExpect(status().isOk());
    }

    private void withdraw(User caller, String id, String partyId, int expected) throws Exception {
        mvc.perform(delete(Routes.ServiceRequests.PARTY_BY_ID, id, partyId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().is(expected));
    }
}
