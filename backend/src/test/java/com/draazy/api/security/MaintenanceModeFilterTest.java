package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

@DisplayName("Maintenance mode (server-side)")
class MaintenanceModeFilterTest extends AbstractApiTest {
    @Autowired
    UserRepository users;

    @PersistenceContext
    EntityManager em;

    @Test
    void maintenanceRefusesAConsumerWrite() throws Exception {
        setMaintenance(true);

        mvc.perform(post(Routes.ServiceWaitlist.BASE)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value("maintenance_mode"));
    }

    @Test
    void anOpenPlatformDoesNotRefuseThatSameWrite() throws Exception {
        setMaintenance(false);

        mvc.perform(post(Routes.ServiceWaitlist.BASE)
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().is(Matchers.not(503)));
    }

    @Test
    void maintenanceLeavesReadsAlone() throws Exception {
        setMaintenance(true);

        mvc.perform(get(Routes.Bootstrap.BASE)).andExpect(status().isOk());
    }

    @Test
    void maintenanceLeavesTheCredentialRoutesOpen() throws Exception {
        setMaintenance(true);

        mvc.perform(post(Routes.Auth.LOGIN).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"mobile\":\"9876511001\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.otpSent").value(true));
    }

    @Test
    void maintenanceExemptsInternalCallers() throws Exception {
        User admin = users.saveAndFlush(new User("9876511002", "admin"));
        setMaintenance(true);

        mvc.perform(post(Routes.ServiceWaitlist.BASE).header(HttpHeaders.AUTHORIZATION, bearer(admin))
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().is(Matchers.not(503)));
    }

    private void setMaintenance(boolean on) {
        int flipped = jdbc.update("update settings set value = "
                + "jsonb_set(value, '{maintenanceMode}', ?::jsonb) where key = 'flags'",
                String.valueOf(on));
        assertThat(flipped).isEqualTo(1);
        em.flush();
        em.clear();
    }
}
