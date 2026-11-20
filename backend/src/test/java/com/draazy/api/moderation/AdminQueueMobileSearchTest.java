package com.draazy.api.moderation;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.property.PropertyStatus;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.math.BigDecimal;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("Moderation queue — owner mobile search ignores spaces and dashes")
class AdminQueueMobileSearchTest extends AbstractApiTest {

    @Autowired
    UserRepository users;
    @Autowired
    PropertyRepository properties;

    private User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Mobile search");
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    @Test
    void aMobileTypedWithSpacesOrDashesFindsTheSameRowsAsTheBareNumber() throws Exception {
        User owner = user("9891300020", "owner");
        User staff = user("9891300021", "staff");
        Property p = new Property(owner, "Zzmobile flat", "rent", "apartment", 30000L, "Baner", "Pune");
        p.setBhk(new BigDecimal("2"));
        p.setPriceUnit("per-month");
        p.setArea(new BigDecimal("850"));
        p.setStatus(PropertyStatus.PENDING);
        properties.saveAndFlush(p);

        for (String typed : new String[] {"9891300020", "98913 00020", "98913-00020", "+91 98913 00020"}) {
            mvc.perform(get("/admin/properties").param("q", typed)
                            .header(HttpHeaders.AUTHORIZATION, bearer(staff)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(1));
        }
    }
}
