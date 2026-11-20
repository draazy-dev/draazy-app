package com.draazy.api.finance.tenancy;

import com.draazy.api.support.AbstractApiTest;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

class TenancyDeclarationFlowTest extends AbstractApiTest {
    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PropertyRepository properties;
    @Autowired TenancyRepository tenancies;
    @Autowired TenancyDeclarationRepository declarations;

    private User user(String mobile, String name) {
        User u = new User(mobile, "buyer");
        u.setName(name);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private Property listing(User owner) {
        Property p = new Property(owner, "2BHK in Wakad", "rent", "apartment", 22000L,
                "Wakad", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("900"));
        p.setStatus(PropertyStatus.APPROVED);
        return properties.saveAndFlush(p);
    }

    private String declarationsPath(Property p) {
        return "/properties/" + p.getId() + "/tenancy-declarations";
    }

    private String declare(User caller, Property p) throws Exception {
        String json = mvc.perform(post(declarationsPath(p))
                        .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"livedFrom\":\"2024-01-01\",\"livedTo\":\"2025-06-30\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.status").value(TenancyDeclarationStatuses.PENDING))
                .andReturn().getResponse().getContentAsString();
        return com.jayway.jsonpath.JsonPath.read(json, "$.id");
    }

    private int reviewAttempt(User author, Property p) throws Exception {
        return mvc.perform(post("/properties/" + p.getId() + "/reviews")
                        .header(HttpHeaders.AUTHORIZATION, bearer(author))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":4,\"body\":\"Lived here for eighteen months.\"}"))
                .andReturn().getResponse().getStatus();
    }

    @Test
    @DisplayName("an unknown ?sort= is ignored rather than a 500, for the owner and a claimant alike")
    void unknownSortIsIgnored() throws Exception {
        User owner = user("9833000091", "Nikhil Rane");
        User claimant = user("9833000092", "Sneha Kale");
        Property p = listing(owner);
        declare(claimant, p);

        for (User caller : new User[] {owner, claimant}) {
            mvc.perform(get(declarationsPath(p)).param("sort", "bogus")
                            .header(HttpHeaders.AUTHORIZATION, bearer(caller)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(1));
        }
    }

    @Test
    @DisplayName("a pending declaration proves nothing — the review door stays shut")
    void pendingDeclarationDoesNotMakeAnyoneEligible() throws Exception {
        User owner = user("9833000001", "Nikhil Rane");
        User claimant = user("9833000002", "Sneha Kale");
        Property p = listing(owner);

        declare(claimant, p);

        assertThat(reviewAttempt(claimant, p)).isEqualTo(422);
    }

    @Test
    @DisplayName("the owner's confirmation is what opens the door, and it badges as a tenancy")
    void confirmedDeclarationMakesTheDeclarantEligible() throws Exception {
        User owner = user("9833000011", "Nikhil Rane");
        User claimant = user("9833000012", "Sneha Kale");
        Property p = listing(owner);
        String id = declare(claimant, p);

        mvc.perform(post("/tenancy-declarations/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(TenancyDeclarationStatuses.CONFIRMED))
                .andExpect(jsonPath("$.decidedAt").isNotEmpty());

        mvc.perform(post("/properties/" + p.getId() + "/reviews")
                        .header(HttpHeaders.AUTHORIZATION, bearer(claimant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"rating\":4,\"body\":\"Lived here for eighteen months.\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.context").value("tenant"));
    }

    @Test
    @DisplayName("revoking a confirmation closes the door again")
    void revokedDeclarationStopsBeingEvidence() throws Exception {
        User owner = user("9833000021", "Nikhil Rane");
        User claimant = user("9833000022", "Sneha Kale");
        Property p = listing(owner);
        String id = declare(claimant, p);

        mvc.perform(post("/tenancy-declarations/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk());
        mvc.perform(post("/tenancy-declarations/" + id + "/revoke")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(TenancyDeclarationStatuses.REVOKED));

        assertThat(reviewAttempt(claimant, p)).isEqualTo(422);
        assertThat(declarations.findByPropertyIdAndDeclarantId(p.getId(), claimant.getId()))
                .isPresent();
    }

    @Test
    @DisplayName("a stranger cannot confirm a claim about somebody else's flat, and gets a 404")
    void onlyTheListingOwnerMayDecide() throws Exception {
        User owner = user("9833000031", "Nikhil Rane");
        User claimant = user("9833000032", "Sneha Kale");
        User stranger = user("9833000033", "Passing Stranger");
        Property p = listing(owner);
        String id = declare(claimant, p);

        mvc.perform(post("/tenancy-declarations/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
        mvc.perform(post("/tenancy-declarations/" + id + "/revoke")
                        .header(HttpHeaders.AUTHORIZATION, bearer(stranger)))
                .andExpect(status().isNotFound());
        mvc.perform(post("/tenancy-declarations/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(claimant)))
                .andExpect(status().isNotFound());
        assertThat(reviewAttempt(claimant, p)).isEqualTo(422);
    }

    @Test
    @DisplayName("an owner rejects a claim they disagree with by revoking it while it is pending")
    void revokingAPendingClaimIsHowAnOwnerSaysNo() throws Exception {
        User owner = user("9833000091", "Nikhil Rane");
        User claimant = user("9833000092", "Sneha Kale");
        Property p = listing(owner);
        String id = declare(claimant, p);

        mvc.perform(post("/tenancy-declarations/" + id + "/revoke")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(TenancyDeclarationStatuses.REVOKED));
        assertThat(reviewAttempt(claimant, p)).isEqualTo(422);

        mvc.perform(post("/tenancy-declarations/" + id + "/confirm")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(TenancyDeclarationStatuses.CONFIRMED));
        assertThat(reviewAttempt(claimant, p)).isEqualTo(201);
    }

    @Test
    @DisplayName("the owner sees every claim on their listing; everyone else sees only their own")
    void listIsScopedByWhoIsAsking() throws Exception {
        User owner = user("9833000041", "Nikhil Rane");
        User first = user("9833000042", "Sneha Kale");
        User second = user("9833000043", "Rohit Jadhav");
        Property p = listing(owner);
        declare(first, p);
        declare(second, p);

        mvc.perform(get(declarationsPath(p)).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.content[0].declarantName").value("Rohit Jadhav"))
                .andExpect(jsonPath("$.content[0].livedFrom").value("2024-01-01"))
                .andExpect(jsonPath("$.content[0].livedTo").value("2025-06-30"))
                .andExpect(jsonPath("$.content[0].decidedAt").doesNotExist())
                .andExpect(jsonPath("$.content[0].*", hasSize(8)))
                .andExpect(jsonPath("$.content[0].mobile").doesNotExist())
                .andExpect(jsonPath("$.content[0].declarantMobile").doesNotExist());

        mvc.perform(get(declarationsPath(p)).header(HttpHeaders.AUTHORIZATION, bearer(first)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].declarantId").value(first.getId().toString()))
                .andExpect(jsonPath("$.content[0].declarantName").value("Sneha Kale"))
                .andExpect(jsonPath("$.content[0].*", hasSize(8)));

        mvc.perform(get(declarationsPath(p))
                        .header(HttpHeaders.AUTHORIZATION, bearer(user("9833000044", "Nobody"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0));

        mvc.perform(get("/properties/" + UUID.randomUUID() + "/tenancy-declarations")
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a deleted claimant leaves the claim readable rather than breaking the inbox")
    void anAbsentDeclarantProjectsAnEmptyName() throws Exception {
        User owner = user("9833000081", "Nikhil Rane");
        User claimant = user("9833000082", "Sneha Kale");
        Property p = listing(owner);
        declare(claimant, p);

        assertThat(TenancyMapper.toDto(
                declarations.findByPropertyIdAndDeclarantId(p.getId(), claimant.getId())
                        .orElseThrow(), null).declarantName())
                .isEmpty();
    }

    @Test
    @DisplayName("an owner cannot be their own tenant, and nobody may claim the same stay twice")
    void declarationRefusals() throws Exception {
        User owner = user("9833000051", "Nikhil Rane");
        User claimant = user("9833000052", "Sneha Kale");
        Property p = listing(owner);

        mvc.perform(post(declarationsPath(p))
                        .header(HttpHeaders.AUTHORIZATION, bearer(owner))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value("You cannot declare a tenancy on your own listing"));

        declare(claimant, p);
        mvc.perform(post(declarationsPath(p))
                        .header(HttpHeaders.AUTHORIZATION, bearer(claimant))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value("You have already declared a stay at this listing"));

        mvc.perform(post("/properties/" + UUID.randomUUID() + "/tenancy-declarations")
                        .header(HttpHeaders.AUTHORIZATION, bearer(claimant))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("a brokered tenancy already proves the stay, so declaring one on top is refused")
    void brokeredTenancyMakesADeclarationPointless() throws Exception {
        User owner = user("9833000061", "Nikhil Rane");
        User tenant = user("9833000062", "Sneha Kale");
        Property p = listing(owner);
        tenancies.saveAndFlush(new Tenancy(p.getId(), tenant.getId(), owner.getId()));

        mvc.perform(post(declarationsPath(p))
                        .header(HttpHeaders.AUTHORIZATION, bearer(tenant))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message")
                        .value("Your tenancy on this listing is already on record"));
        assertThat(reviewAttempt(tenant, p)).isEqualTo(201);
    }

    @Test
    @DisplayName("a stay that ends before it starts is a typo, and is answered as one")
    void reversedDatesAreRejectedAsBadInput() throws Exception {
        User owner = user("9833000071", "Nikhil Rane");
        User claimant = user("9833000072", "Sneha Kale");
        Property p = listing(owner);

        mvc.perform(post(declarationsPath(p))
                        .header(HttpHeaders.AUTHORIZATION, bearer(claimant))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"livedFrom\":\"2025-06-30\",\"livedTo\":\"2024-01-01\"}"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.fields[0].field").value("dateRangeOrdered"));

        mvc.perform(get(declarationsPath(p)).header(HttpHeaders.AUTHORIZATION, bearer(owner)))
                .andExpect(jsonPath("$.content.length()").value(0));
    }
}
