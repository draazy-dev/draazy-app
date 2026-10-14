package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

@DisplayName("Deleting a vault paper withdraws the copies filed on unsubmitted requests")
class VaultDeleteFiledCopiesTest extends ServiceFixtures {

    @Autowired
    EntityManager em;

    @Test
    @DisplayName("an unpaid request loses its copy; a request already with staff keeps its record")
    void onlyUnsubmittedCopiesGo() throws Exception {
        User owner = customer("9820000901");
        String submitted = create(owner);
        setStatus(submitted, "in-progress");
        String unpaid = create(owner);
        setStatus(unpaid, "awaiting-payment");
        String vaultId = vaultUpload(owner, "pan.pdf");
        String key = storageKey(vaultId);
        fromVault(owner, unpaid, vaultId);
        fromVault(owner, submitted, vaultId);

        deleteFromVault(owner, vaultId);

        assertThat(filedCopies(unpaid)).isZero();
        assertThat(filedCopies(submitted)).isEqualTo(1);
        assertThat(vaultRows(vaultId)).isZero();
        assertThat(purgeQueued(key)).as("the kept copy still points at the bytes").isFalse();
    }

    @Test
    @DisplayName("the stored file leaves storage once no row references it")
    void lastReferenceTakesTheBytes() throws Exception {
        User owner = customer("9820000902");
        String unpaid = create(owner);
        setStatus(unpaid, "awaiting-payment");
        String vaultId = vaultUpload(owner, "pan.pdf");
        String key = storageKey(vaultId);
        fromVault(owner, unpaid, vaultId);

        deleteFromVault(owner, vaultId);

        assertThat(filedCopies(unpaid)).isZero();
        assertThat(purgeQueued(key)).isTrue();
    }

    @Test
    @DisplayName("a different vault paper filed on the same unpaid request is left alone")
    void otherPapersSurvive() throws Exception {
        User owner = customer("9820000903");
        String unpaid = create(owner);
        setStatus(unpaid, "awaiting-payment");
        String gone = vaultUpload(owner, "pan.pdf");
        String kept = vaultUpload(owner, "aadhaar.pdf");
        fromVault(owner, unpaid, gone);
        fromVault(owner, unpaid, kept);

        deleteFromVault(owner, gone);

        assertThat(filedCopies(unpaid)).isEqualTo(1);
    }

    private String create(User owner) throws Exception {
        String body = mvc.perform(post(Routes.ServiceRequests.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"type\":\"rent-agreement\",\"details\":{\"_state\":"
                                + "{\"owner\":{\"oMobile\":\"" + owner.getMobile() + "\"}}}}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(body, "id");
    }

    private String vaultUpload(User caller, String fileName) throws Exception {
        String body = mvc.perform(multipart(Routes.MeDocuments.PERSONAL)
                        .file(new MockMultipartFile("file", fileName, "application/pdf", "%PDF-1.4".getBytes()))
                        .param("category", "PAN Card")
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return field(body, "id");
    }

    private void fromVault(User caller, String requestId, String vaultId) throws Exception {
        mvc.perform(post(Routes.ServiceRequests.DOCS_FROM_VAULT, requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"documentId\":\"" + vaultId + "\",\"category\":\"licensor-0-pan\"}"))
                .andExpect(status().isCreated());
    }

    private void deleteFromVault(User caller, String vaultId) throws Exception {
        mvc.perform(delete(Routes.MeDocuments.PERSONAL_BY_ID, vaultId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                .andExpect(status().isNoContent());
    }

    private void setStatus(String requestId, String status) {
        jdbc.update("update service_requests set status = ? where id = ?::uuid", status, requestId);
        em.clear();
    }

    private String storageKey(String vaultId) {
        return jdbc.queryForObject("select storage_key from personal_documents where id = ?::uuid",
                String.class, vaultId);
    }

    private long filedCopies(String requestId) {
        return jdbc.queryForObject("select count(*) from documents where service_request_id = ?::uuid",
                Long.class, requestId);
    }

    private long vaultRows(String vaultId) {
        return jdbc.queryForObject("select count(*) from personal_documents where id = ?::uuid",
                Long.class, vaultId);
    }

    private boolean purgeQueued(String key) {
        return jdbc.queryForObject("select count(*) from identity_storage_deletes where storage_key = ?",
                Long.class, key) > 0;
    }
}
