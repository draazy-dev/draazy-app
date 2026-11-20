package com.draazy.api.documents;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.ManagedPropertyDocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

class ManagedPropertyDocumentTest extends AbstractApiTest {
    @Autowired
    UserRepository users;
    @Autowired
    ManagedPropertyDocumentRepository managedDocuments;
    @Autowired
    EntityManager em;

    private User user(String mobile) {
        User u = new User(mobile, "owner");
        u.setName("Asha Patil");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String record(User owner, String locality) throws Exception {
        String json = mvc.perform(post(Routes.MeManagedProperties.BASE)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"deal\":\"rent\",\"propertyType\":\"Flat\",\"bhk\":2,"
                                + "\"price\":25000,\"locality\":\"" + locality + "\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");
    }

    private static MockMultipartFile pdf(String name) {
        return new MockMultipartFile("file", name, "application/pdf", "%PDF-1.4 sale deed".getBytes());
    }

    private String upload(User owner, String managedId, String category, MockMultipartFile file)
            throws Exception {
        String json = mvc.perform(multipart(Routes.MeDocuments.FOR_MANAGED, managedId)
                        .file(file)
                        .param("category", category)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return json.replaceAll("^.*?\"id\":\"([^\"]+)\".*$", "$1");
    }

    @Test
    void managedRoute_outranksThePropIdTemplate_soItReachesTheManagedHandler() throws Exception {
        User owner = user("9841004001");
        String managedId = record(owner, "Baner");

        mvc.perform(get(Routes.MeDocuments.FOR_MANAGED, managedId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void upload_returnsAMintedUrlThatIsNotStoredOnTheRow() throws Exception {
        User owner = user("9841004002");
        String managedId = record(owner, "Baner");

        String docId = upload(owner, managedId, "Sale Deed", pdf("deed.pdf"));

        assertThat(managedDocuments.findById(UUID.fromString(docId)))
                .get()
                .satisfies(d -> {
                    assertThat(d.getManagedPropertyId()).isEqualTo(UUID.fromString(managedId));
                    assertThat(d.getStorageKey()).startsWith("managed/" + managedId + "/");
                    assertThat(d.getStorageKey()).doesNotContain("http");
                });
    }

    @Test
    void upload_returnsMetadataOnly() throws Exception {
        User owner = user("9841004003");
        String managedId = record(owner, "Baner");

        mvc.perform(multipart(Routes.MeDocuments.FOR_MANAGED, managedId)
                        .file(pdf("index2.pdf"))
                        .param("category", "Index II")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.category").value("Index II"))
                .andExpect(jsonPath("$.propertyId").doesNotExist())
                .andExpect(jsonPath("$.url").doesNotExist());
    }

    @Test
    void upload_toSomeoneElsesRecordIs404_beforeAnyBytesAreStored() throws Exception {
        User owner = user("9841004005");
        User stranger = user("9841004006");
        String managedId = record(owner, "Baner");

        mvc.perform(multipart(Routes.MeDocuments.FOR_MANAGED, managedId)
                        .file(pdf("deed.pdf"))
                        .param("category", "Sale Deed")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());

        assertThat(managedDocuments.findByManagedPropertyIdOrderByUploadedAtDescIdDesc(
                UUID.fromString(managedId))).isEmpty();
    }

    @Test
    void list_showsOnlyThatRecordsPapers_newestFirst() throws Exception {
        User owner = user("9841004007");
        String baner = record(owner, "Baner");
        String kothrud = record(owner, "Kothrud");
        upload(owner, baner, "Sale Deed", pdf("deed.pdf"));
        upload(owner, baner, "Index II", pdf("index2.pdf"));
        upload(owner, kothrud, "Society NOC", pdf("noc.pdf"));

        mvc.perform(get(Routes.MeDocuments.FOR_MANAGED, baner)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$[0].category").value("Index II"))
                .andExpect(jsonPath("$[1].category").value("Sale Deed"));
    }

    @Test
    void list_onSomeoneElsesRecordIs404() throws Exception {
        User owner = user("9841004008");
        User stranger = user("9841004009");
        String managedId = record(owner, "Baner");
        upload(owner, managedId, "Sale Deed", pdf("deed.pdf"));

        mvc.perform(get(Routes.MeDocuments.FOR_MANAGED, managedId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
    }

    @Test
    void list_onAnUnknownRecordIs404_notAnEmptyVault() throws Exception {
        User owner = user("9841004010");

        mvc.perform(get(Routes.MeDocuments.FOR_MANAGED, UUID.randomUUID())
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNotFound());
    }

    @Test
    void delete_removesOnePaperAndLeavesTheRest() throws Exception {
        User owner = user("9841004011");
        String managedId = record(owner, "Baner");
        String deed = upload(owner, managedId, "Sale Deed", pdf("deed.pdf"));
        upload(owner, managedId, "Index II", pdf("index2.pdf"));

        mvc.perform(delete(Routes.MeDocuments.MANAGED_BY_ID, managedId, deed)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());

        mvc.perform(get(Routes.MeDocuments.FOR_MANAGED, managedId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].category").value("Index II"));
    }

    @Test
    void delete_refusesAPaperFromAnotherRecordOfTheSameOwner() throws Exception {
        User owner = user("9841004012");
        String baner = record(owner, "Baner");
        String kothrud = record(owner, "Kothrud");
        String deed = upload(owner, baner, "Sale Deed", pdf("deed.pdf"));

        mvc.perform(delete(Routes.MeDocuments.MANAGED_BY_ID, kothrud, deed)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNotFound());

        assertThat(managedDocuments.findByManagedPropertyIdOrderByUploadedAtDescIdDesc(
                UUID.fromString(baner))).hasSize(1);
    }

    @Test
    void delete_onSomeoneElsesRecordIs404() throws Exception {
        User owner = user("9841004013");
        User stranger = user("9841004014");
        String managedId = record(owner, "Baner");
        String deed = upload(owner, managedId, "Sale Deed", pdf("deed.pdf"));

        mvc.perform(delete(Routes.MeDocuments.MANAGED_BY_ID, managedId, deed)
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());

        assertThat(managedDocuments.findByManagedPropertyIdOrderByUploadedAtDescIdDesc(
                UUID.fromString(managedId))).hasSize(1);
    }

    @Test
    void deletingTheRecord_takesItsPapersWithIt() throws Exception {
        User owner = user("9841004015");
        String managedId = record(owner, "Baner");
        upload(owner, managedId, "Sale Deed", pdf("deed.pdf"));

        mvc.perform(delete(Routes.MeManagedProperties.BY_ID, managedId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNoContent());

        em.flush();
        em.clear();

        assertThat(managedDocuments.findByManagedPropertyIdOrderByUploadedAtDescIdDesc(
                UUID.fromString(managedId))).isEmpty();
    }
}
