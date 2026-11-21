package com.draazy.api.documents;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.DocumentService;
import com.draazy.api.documents.vault.PersonalDocument;
import com.draazy.api.documents.vault.PersonalDocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockMultipartFile;

class PersonalDocumentFlowTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    PersonalDocumentRepository personalDocuments;
    @Autowired
    DocumentService documentService;

    private User user(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Asha Patil");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private static MockMultipartFile pdf(String name) {
        return new MockMultipartFile("file", name, "application/pdf", "%PDF-1.4 paper".getBytes());
    }

    private String upload(User owner, String category, MockMultipartFile file) throws Exception {
        String json = mvc.perform(multipart(Routes.MeDocuments.PERSONAL)
                        .file(file)
                        .param("category", category)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^.*?\"id\":\"([^\"]+)\".*", "$1");
    }

    @Test
    void uploadPersonal_returnsAMintedUrlThatIsNotStoredOnTheRow() throws Exception {
        User owner = user("9821002002");

        String id = upload(owner, "Rent agreement", pdf("agreement.pdf"));

        assertThat(personalDocuments.findById(java.util.UUID.fromString(id)))
                .get()
                .satisfies(d -> {
                    assertThat(d.getOwnerId()).isEqualTo(owner.getId());
                    assertThat(d.getStorageKey()).startsWith("personal/" + owner.getId() + "/");
                    assertThat(d.getStorageKey()).doesNotContain("http");
                });
    }

    @Test
    void uploadPersonal_returnsMetadataOnly() throws Exception {
        User owner = user("9821002003");

        mvc.perform(multipart(Routes.MeDocuments.PERSONAL)
                        .file(pdf("bill.pdf"))
                        .param("category", "Electricity Bill")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("Electricity Bill"))
                .andExpect(jsonPath("$.propertyId").doesNotExist())
                .andExpect(jsonPath("$.url").doesNotExist());
    }

    @Test
    void listPersonal_showsOnlyTheCallersOwnPapers_newestFirst() throws Exception {
        User owner = user("9821002005");
        User other = user("9821002006");
        upload(owner, "Rent agreement", pdf("agreement.pdf"));
        upload(owner, "Electricity Bill", pdf("bill.pdf"));
        upload(other, "Rent agreement", pdf("theirs.pdf"));

        mvc.perform(get(Routes.MeDocuments.PERSONAL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].category").value("Electricity Bill"))
                .andExpect(jsonPath("$[0].propertyId").doesNotExist())
                .andExpect(jsonPath("$[0].url").doesNotExist());
    }

    @Test
    void deletePersonal_removesItFromTheCallersVault() throws Exception {
        User owner = user("9821002007");
        String id = upload(owner, "Rent agreement", pdf("agreement.pdf"));
        String key = personalDocuments.findById(java.util.UUID.fromString(id)).orElseThrow().getStorageKey();

        mvc.perform(delete(Routes.MeDocuments.PERSONAL_BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());

        mvc.perform(get(Routes.MeDocuments.PERSONAL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.length()").value(0));
        assertThat(jdbc.queryForObject("select count(*) from identity_storage_deletes where storage_key = ?",
                Long.class, key)).isEqualTo(1L);
    }

    @Test
    void deletePersonal_isA404OnAnotherUsersDocument_notA403() throws Exception {
        User owner = user("9821002008");
        User stranger = user("9821002009");
        String id = upload(owner, "Rent agreement", pdf("agreement.pdf"));

        mvc.perform(delete(Routes.MeDocuments.PERSONAL_BY_ID, id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());

        mvc.perform(get(Routes.MeDocuments.PERSONAL)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void uploadPersonal_refusesIdentityPapersAndOwnershipProof_inAnyCase() throws Exception {
        User owner = user("9821002011");

        for (String category : List.of("Aadhaar Card", "PAN Card", "Passport Photo", "Ownership Proof",
                " ownership proof ", "AADHAAR CARD")) {
            mvc.perform(multipart(Routes.MeDocuments.PERSONAL)
                            .file(pdf("id.pdf"))
                            .param("category", category)
                            .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                    .andExpect(status().isBadRequest());
        }
        assertThat(personalDocuments.findByOwnerIdOrderByUploadedAtDescIdDesc(owner.getId())).isEmpty();
    }

    @Test
    void purgeRetiredPersonal_dropsIdentityAndOwnershipRowsAndTheirFiles_keepsEvidence() throws Exception {
        User owner = user("9821002012");
        for (String category : List.of("Aadhaar Card", "pan card", "Passport Photo", "Ownership Proof",
                "Rent agreement")) {
            jdbc.update("""
                    insert into personal_documents (owner_id, category, file_name, storage_key, size_bytes, mime_type)
                    values (?, ?, 'paper.pdf', ?, 1024, 'application/pdf')
                    """, owner.getId(), category, "personal/" + owner.getId() + "/" + category);
        }

        documentService.purgeRetiredPersonal();

        assertThat(personalDocuments.findByOwnerIdOrderByUploadedAtDescIdDesc(owner.getId()))
                .extracting(PersonalDocument::getCategory).containsExactly("Rent agreement");
        assertThat(jdbc.queryForList("select storage_key from identity_storage_deletes where storage_key like ?",
                String.class, "personal/" + owner.getId() + "/%"))
                .hasSize(4).noneMatch(key -> key.endsWith("Rent agreement"));
    }

    @Test
    void deletePersonal_treatsANonUuidIdAsAMiss_notAMalformedRequest() throws Exception {
        User owner = user("9821002010");

        mvc.perform(delete(Routes.MeDocuments.PERSONAL_BY_ID, "not-a-uuid")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNotFound());
    }
}
