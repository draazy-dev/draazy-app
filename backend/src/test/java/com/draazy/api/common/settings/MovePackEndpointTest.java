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
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

class MovePackEndpointTest extends AbstractApiTest {
    @Autowired UserRepository users;

    private String adminToken() {
        User u = new User("9877720011", Roles.Wire.ADMIN);
        u.setName("Pack Admin");
        u.setMobileVerified(true);
        return "Bearer " + jwtService.issueAccessToken(users.saveAndFlush(u));
    }

    @Test
    void anonymousCallersGetTheSeededPrices() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movePack.items.movers").value(8000))
                .andExpect(jsonPath("$.movePack.items.clean").value(2500))
                .andExpect(jsonPath("$.movePack.items.verify").value(999));
    }

    @Test
    void thePackShipsDisabledButPriced() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movePack.enabled").value(false))
                .andExpect(jsonPath("$.movePack.items").isNotEmpty());
    }

    @Test
    void aLaunchSavedByAnAdminIsVisibleToAnAnonymousClient() throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"movePack\":{\"enabled\":true,\"items\":{\"movers\":9500}}}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movePack.enabled").value(true))
                .andExpect(jsonPath("$.movePack.items.movers").value(9500))
                .andExpect(jsonPath("$.movePack.items.clean").value(2500));
    }

    @Test
    void pricesThatAreNotWholeNonNegativeNumbersAreOmitted() throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"movePack\":{\"items\":"
                                + "{\"paint\":\"6000\",\"verify\":-1,\"internet\":12.5}}}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movePack.items.paint").doesNotExist())
                .andExpect(jsonPath("$.movePack.items.verify").doesNotExist())
                .andExpect(jsonPath("$.movePack.items.internet").doesNotExist())
                .andExpect(jsonPath("$.movePack.items.movers").value(8000));
    }

    @Test
    void aMalformedBlockFallsBackToComingSoon() throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"movePack\":\"not an object\"}"))
                .andExpect(status().isOk());

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.movePack.enabled").value(false))
                .andExpect(jsonPath("$.movePack.items").isEmpty());
    }
}
