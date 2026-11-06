package com.draazy.api.common.settings;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class GeoPolicyEndpointTest extends AbstractApiTest {
    @Autowired UserRepository users;

    // REQUIRES_NEW audit rows survive rollback; clear by actor, not action,
    // because other tests legitimately write settings.update.
    private static final String ADMIN_MOBILE = "9877730001";

    private String adminId;

    @AfterEach
    void clearAudit() {
        if (adminId != null) {
            jdbc.update("delete from audit_log where actor = ?", adminId);
        }
    }

    private String adminToken;

    private String adminToken() {
        if (adminToken == null) {
            User u = new User(ADMIN_MOBILE, Roles.Wire.ADMIN);
            u.setName("Geo Admin");
            u.setMobileVerified(true);
            User saved = users.saveAndFlush(u);
            adminId = saved.getId().toString();
            adminToken = "Bearer " + jwtService.issueAccessToken(saved);
        }
        return adminToken;
    }

    private void save(String geoJson) throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, adminToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"geo\":" + geoJson + "}"))
                .andExpect(status().isOk());
    }

    @Test
    void anonymousCallersGetAnEmptyPolicyOnAnUnconfiguredInstall() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.cities").doesNotExist())
                .andExpect(jsonPath("$.geo.districtAreas").isArray())
                .andExpect(jsonPath("$.geo.districtAreas").isEmpty())
                .andExpect(jsonPath("$.geo.blacklist").isArray())
                .andExpect(jsonPath("$.geo.blacklist").isEmpty())
                .andExpect(jsonPath("$.geo.enforceCityLimit").doesNotExist());
    }

    @Test
    void retiredCityBoxesAreNoLongerPublished() throws Exception {
        save("""
                {"cities":{"Mumbai":{"center":{"lat":19.076,"lng":72.8777}}}}""");

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.cities").doesNotExist());
    }

    @Test
    void theBlacklistIsPublishedWithoutTheOperatorsReason() throws Exception {
        save("""
                {"blacklist":[{"id":"bl1","placeId":"ChIJxyz","term":"Sunrise Towers",\
                "note":"Repeated fake listings, owner disputed","at":1730000000000}]}""");

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.blacklist[0].id").value("bl1"))
                .andExpect(jsonPath("$.geo.blacklist[0].placeId").value("ChIJxyz"))
                .andExpect(jsonPath("$.geo.blacklist[0].term").value("Sunrise Towers"))
                .andExpect(jsonPath("$.geo.blacklist[0].note").doesNotExist())
                .andExpect(jsonPath("$.geo..note").isEmpty());
    }

    @Test
    void blacklistEntriesThatCouldMatchNothingAreOmitted() throws Exception {
        save("""
                {"blacklist":[{"id":"bl1","term":"a"},{"id":"bl2","term":"Skyline"},\
                {"id":"bl3","term":"DY"}]}""");

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.blacklist.length()").value(2))
                .andExpect(jsonPath("$.geo.blacklist[0].id").value("bl2"))
                .andExpect(jsonPath("$.geo.blacklist[1].id").value("bl3"))
                .andExpect(jsonPath("$.geo.blacklist[1].term").value("DY"));
    }

    @Test
    void theServedDistrictsDefaultToPune() throws Exception {
        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.servedDistricts.length()").value(1))
                .andExpect(jsonPath("$.geo.servedDistricts[0]").value("Pune"));
    }

    @Test
    void storedDuplicateDistrictsArePublishedOnce() throws Exception {
        jdbc.update("insert into settings (key, value) values ('geo', '{\"servedDistricts\":[\"Pune\",\" pune \"]}'::jsonb) "
                + "on conflict (key) do update set value = excluded.value");

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.servedDistricts.length()").value(1))
                .andExpect(jsonPath("$.geo.servedDistricts[0]").value("Pune"));
    }

    @Test
    void anyDistrictCanBeServedWithItsMapArea() throws Exception {
        save("""
                {"servedDistricts":["Pune",{"name":"Satara","placeId":"ChIJsatara",\
                "bounds":{"north":18.2,"south":17.1,"east":74.9,"west":73.6}}]}""");

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.servedDistricts.length()").value(2))
                .andExpect(jsonPath("$.geo.servedDistricts[1]").value("Satara"))
                .andExpect(jsonPath("$.geo.districtAreas.length()").value(1))
                .andExpect(jsonPath("$.geo.districtAreas[0].name").value("Satara"))
                .andExpect(jsonPath("$.geo.districtAreas[0].placeId").value("ChIJsatara"))
                .andExpect(jsonPath("$.geo.districtAreas[0].bounds.north").value(18.2));
    }

    @Test
    void savingTheDistrictListReplacesItWhole() throws Exception {
        save("""
                {"servedDistricts":["Pune",{"name":"Satara","placeId":"ChIJsatara"}]}""");
        save("""
                {"servedDistricts":["Pune"]}""");

        mvc.perform(get(Routes.Bootstrap.BASE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.servedDistricts.length()").value(1))
                .andExpect(jsonPath("$.geo.districtAreas").isEmpty());
    }

    @Test
    void badServedDistrictsAreRefused() throws Exception {
        for (String bad : new String[] {
                "[]", "\"Pune\"", "[42]", "[\"P\"]", "[\"  \"]", "[\"Pune\",\" pune \"]",
                "[{\"placeId\":\"ChIJx\"}]", "[{\"name\":\"Satara\",\"placeId\":7}]",
                "[{\"name\":\"Satara\",\"bounds\":{\"north\":17,\"south\":18,\"east\":74,\"west\":73}}]",
                "[{\"name\":\"Satara\",\"bounds\":{\"north\":18}}]"}) {
            mvc.perform(put(Routes.Admin.SETTINGS)
                            .header(HttpHeaders.AUTHORIZATION, adminToken())
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"geo\":{\"servedDistricts\":" + bad + "}}"))
                    .andExpect(status().isUnprocessableContent());
        }
    }
}
