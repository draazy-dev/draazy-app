package com.draazy.api.moderation.verification;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.web.Routes;
import com.draazy.api.documents.vault.Document;
import com.draazy.api.documents.vault.DocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import com.draazy.api.support.IdentityCases;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("Ownership badge request - ID check first")
class OwnershipRequestIdentityGateTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @Autowired
    PropertyRepository properties;

    @Autowired
    DocumentRepository documents;

    private User owner(String mobile) {
        User u = new User(mobile, Roles.Wire.OWNER);
        u.setName("Owner " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private String listingWithPapers(User owner) {
        Property flat = properties.saveAndFlush(new Property(owner, "Flat in Baner", "rent", "apartment",
                45000L, "Baner", "Pune"));
        documents.saveAndFlush(new Document(flat.getId(), "Electricity Bill", "bill.pdf",
                "documents/" + flat.getId() + "/" + UUID.randomUUID(), 1024L, "application/pdf"));
        return flat.getId().toString();
    }

    private org.springframework.test.web.servlet.ResultActions request(User owner, String propertyId)
            throws Exception {
        return mvc.perform(post(Routes.Moderation.VERIFICATION_OWNERSHIP_REQUEST, propertyId)
                .header(HttpHeaders.AUTHORIZATION, bearer(owner)));
    }

    @Test
    @DisplayName("an owner who never submitted an ID check is told to, and nothing is requested")
    void refusedWithoutIdentity() throws Exception {
        User owner = owner("9820000301");
        String propertyId = listingWithPapers(owner);
        request(owner, propertyId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("identity_required"));
        request(owner, propertyId).andExpect(status().isConflict());
    }

    @Test
    @DisplayName("an ID still in review is enough to send the request")
    void allowedWhileIdentityInReview() throws Exception {
        User owner = owner("9820000302");
        IdentityCases.submitted(jdbc, owner.getId());
        request(owner, listingWithPapers(owner))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.requestedAt").isNotEmpty());
    }
}
