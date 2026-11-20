package com.draazy.api.common.settings;

import com.draazy.api.support.AbstractApiTest;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class AppFlagsEndpointTest extends AbstractApiTest {
    @Autowired UserRepository users;

    @PersistenceContext EntityManager em;

    private String adminToken() {
        User u = new User("9877720001", Roles.Wire.ADMIN);
        u.setName("Flags Admin");
        u.setMobileVerified(true);
        return "Bearer " + jwtService.issueAccessToken(users.saveAndFlush(u));
    }

    @Test
    void anonymousCallersGetTheSeededFlags() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.kycBadgeEnabled").value(true))
                .andExpect(jsonPath("$.flags.boostEnabled").doesNotExist())
                .andExpect(jsonPath("$.flags.staffLoginEnabled").doesNotExist())
                .andExpect(jsonPath("$.flags.maintenanceMode").value(false));
    }

    @Test
    void aFlagSavedByAnAdminIsVisibleToAnAnonymousClient() throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"maintenanceMode\":true,\"mapSearch\":false}}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.maintenanceMode").value(true))
                .andExpect(jsonPath("$.flags.mapSearch").value(false))

                .andExpect(jsonPath("$.flags.kycBadgeEnabled").value(true));
    }

    @Test
    void nonBooleanValuesAreOmitted() throws Exception {
        jdbc.update("update settings set value = jsonb_set(value, '{emiCalculator}', '\"false\"') "
                + "where key = 'flags'");

        em.flush();
        em.clear();

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.emiCalculator").doesNotExist())

                .andExpect(jsonPath("$.flags.maintenanceMode").value(false));
    }
}
