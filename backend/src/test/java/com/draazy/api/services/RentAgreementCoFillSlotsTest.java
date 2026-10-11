package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Co-fill slots: a party files and loses papers only for its own index")
class RentAgreementCoFillSlotsTest extends ServiceFixtures {

    @Test
    @DisplayName("the category's case never changes which slot an upload is authorised for or filed under")
    void categoryCaseDoesNotCrossSlots() throws Exception {
        User tenant = customer("9820000831");
        User owner = customer("9820000832");
        String id = coFillOwnerFirst(tenant, owner);

        upload(owner, id, "licensor-1-pan", 403);
        upload(owner, id, "LICENSOR-1-PAN", 403);
        upload(owner, id, " Licensor-1-Pan ", 403);
        upload(owner, id, "TENANT-0-PHOTO", 403);
        assertThat(categories(id)).isEmpty();

        upload(owner, id, "LICENSOR-0-PAN", 201);
        assertThat(categories(id)).containsExactly("licensor-0-pan");
        read(owner, id).andExpect(jsonPath("$.documents[0].category").value("licensor-0-pan"));
    }

    @Test
    @DisplayName("a category that looks indexed but is not a well-formed slot is refused, not filed under slot 0")
    void malformedIndexedCategoryIsRefused() throws Exception {
        User tenant = customer("9820000833");
        User owner = customer("9820000834");
        String id = coFillOwnerFirst(tenant, owner);

        for (String bad : List.of("licensor-01-pan", "licensor-1x-pan", "licensor-99999999999-pan",
                "LICENSOR-7-", "tenant-1", "licensor-1")) {
            upload(owner, id, bad, 400);
        }
        upload(tenant, id, "licensor-1x-pan", 400);
        upload(admin("9820000835"), id, "licensor-01-pan", 400);
        assertThat(categories(id)).isEmpty();
    }

    @Test
    @DisplayName("the customer cannot file a draft or the registered copy by changing the case")
    void reservedCategoriesAreCaseInsensitive() throws Exception {
        User tenant = customer("9820000836");
        User owner = customer("9820000837");
        String id = coFillOwnerFirst(tenant, owner);

        upload(owner, id, "draft", 422);
        upload(owner, id, "DRAFT", 422);
        upload(owner, id, "Final-Document", 422);
        assertThat(categories(id)).isEmpty();
    }

    @Test
    @DisplayName("inviting another licensor leaves an accepted licensor's scans alone; re-inviting an index clears only that index")
    void inviteTouchesOnlyTheInvitedIndex() throws Exception {
        User tenant = customer("9820000838");
        User owner = customer("9820000839");
        User coOwner = customer("9820000840");
        String id = coFillOwnerFirst(tenant, owner);
        for (String paper : List.of("pan", "aadhaar", "photo")) {
            upload(owner, id, "licensor-0-" + paper, 201);
        }
        seed(id, "licensor-1-pan");
        seed(id, "licensor-2-pan");
        upload(tenant, id, "tenant-0-pan", 201);

        String invited = invite(tenant, id, 1, coOwner.getMobile());
        assertThat(categories(id)).containsExactlyInAnyOrder("licensor-0-pan", "licensor-0-aadhaar",
                "licensor-0-photo", "licensor-2-pan", "tenant-0-pan");

        mvc.perform(delete(Routes.ServiceRequests.PARTY_BY_ID, id, field(invited, "id"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant)))
                .andExpect(status().isNoContent());
        seed(id, "licensor-1-photo");
        invite(tenant, id, 1, "9820000841");
        assertThat(categories(id)).containsExactlyInAnyOrder("licensor-0-pan", "licensor-0-aadhaar",
                "licensor-0-photo", "licensor-2-pan", "tenant-0-pan");

        upload(owner, id, "licensor-0-pan", 201);
        assertThat(categories(id)).filteredOn("licensor-0-pan"::equals).hasSize(2);
    }

    private String coFillOwnerFirst(User tenant, User owner) throws Exception {
        String created = mvc.perform(post(Routes.ServiceRequests.CO_FILL_CREATE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"request\":{\"type\":\"rent-agreement\",\"details\":{\"_state\":"
                                + "{\"tenants\":[{\"name\":\"Ria Sharma\",\"mobile\":\"" + tenant.getMobile() + "\"}]}}},"
                                + "\"role\":\"owner\",\"mobile\":\"" + owner.getMobile() + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        String invites = mvc.perform(get(Routes.ServiceRequests.MY_INVITES)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        mvc.perform(post(Routes.ServiceRequests.INVITE_DECISION, field(invites, "id"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"decision\":\"accept\"}"))
                .andExpect(status().isOk());
        return field(created, "id");
    }

    private String invite(User requester, String id, int index, String mobile) throws Exception {
        return mvc.perform(post(Routes.ServiceRequests.PARTIES, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(requester))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"role\":\"owner\",\"partyIndex\":" + index + ",\"mobile\":\"" + mobile + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
    }

    private void seed(String id, String category) {
        jdbc.update("insert into documents (category, file_name, storage_key, service_request_id) values (?, 'x.pdf', ?, ?)",
                category, "test/" + UUID.randomUUID(), UUID.fromString(id));
    }

    private List<String> categories(String id) {
        return jdbc.queryForList("select category from documents where service_request_id = ?", String.class,
                UUID.fromString(id));
    }

    private org.springframework.test.web.servlet.ResultActions read(User caller, String id) throws Exception {
        return mvc.perform(get(Routes.ServiceRequests.BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isOk());
    }
}
