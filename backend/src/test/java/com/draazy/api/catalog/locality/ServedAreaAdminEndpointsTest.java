package com.draazy.api.catalog.locality;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.PlacesLookup;
import com.draazy.api.provider.PlacesLookup.Place;
import com.draazy.api.support.AbstractApiTest;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@DisplayName("Served area: admins see live places outside the served districts and re-check old ones")
class ServedAreaAdminEndpointsTest extends AbstractApiTest {

    private static final AtomicInteger PHONE = new AtomicInteger();

    @MockitoBean PlacesLookup places;
    @Autowired UserRepository users;

    @BeforeEach
    @AfterEach
    void clearAudit() {
        jdbc.update("delete from audit_log where action = 'servedArea.recheck'");
    }

    @BeforeEach
    void onlyTheTestRowsAreUnchecked() {
        jdbc.update("update localities set district_checked_at = now() where district_checked_at is null");
        jdbc.update("update societies set district_checked_at = now() where district_checked_at is null");
    }

    private String token(String role) {
        User u = new User("98620200" + String.format("%02d", PHONE.getAndIncrement()), role);
        u.setName("Served area");
        u.setMobileVerified(true);
        return bearer(users.saveAndFlush(u));
    }

    private void locality(String slug, String placeId, String district, boolean checked) {
        jdbc.update("insert into localities (slug, name, city, lat, lng, place_id, active, district, "
                + "district_checked_at) values (?, ?, 'Pune', 18.79, 73.34, ?, true, ?, "
                + (checked ? "now()" : "null") + ")", slug, "Name " + slug, placeId, district);
    }

    private String district(String slug) {
        return jdbc.queryForObject("select district from localities where slug = ?", String.class, slug);
    }

    @Test
    @DisplayName("the report lists checked rows outside the served districts and counts the unchecked ones")
    void reportListsOutsideRows() throws Exception {
        locality("zz-sa-raigad", "ChIJ-sa-raigad", "Raigad", true);
        locality("zz-sa-pune", "ChIJ-sa-pune", "PUNE", true);
        locality("zz-sa-none", "ChIJ-sa-none", null, true);
        locality("zz-sa-old", "ChIJ-sa-old", null, false);

        mvc.perform(get(Routes.ServedArea.ADMIN).header(HttpHeaders.AUTHORIZATION, token("admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.servedDistricts[0]").value("Pune"))
                .andExpect(jsonPath("$.outside[?(@.slug == 'zz-sa-raigad')].district").value("Raigad"))
                .andExpect(jsonPath("$.outside[?(@.slug == 'zz-sa-none')].kind").value("locality"))
                .andExpect(jsonPath("$.outside[?(@.slug == 'zz-sa-pune')]").isEmpty())
                .andExpect(jsonPath("$.outside[?(@.slug == 'zz-sa-old')]").isEmpty())
                .andExpect(jsonPath("$.unchecked").value(1));
    }

    @Test
    @DisplayName("the outside total counts every outside row, not just the first 200 returned")
    void outsideTotalIsUncapped() throws Exception {
        for (int i = 0; i < 201; i++) {
            locality("zz-sa-cap-" + i, "ChIJ-sa-cap-" + i, "Raigad", true);
        }
        Integer expected = jdbc.queryForObject("select (select count(*) from localities where archived_at is null"
                + " and district_checked_at is not null and (district is null or lower(btrim(district)) <> 'pune'))"
                + " + (select count(*) from societies where archived_at is null and merged_into is null"
                + " and district_checked_at is not null and (district is null or lower(btrim(district)) <> 'pune'))",
                Integer.class);

        mvc.perform(get(Routes.ServedArea.ADMIN).header(HttpHeaders.AUTHORIZATION, token("admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.outside.length()").value(200))
                .andExpect(jsonPath("$.outsideTotal").value(expected));
    }

    @Test
    @DisplayName("re-check asks Google for each unchecked row, stores its district and is audited")
    void recheckStoresDistricts() throws Exception {
        locality("zz-sa-a", "ChIJ-sa-a", null, false);
        locality("zz-sa-b", "ChIJ-sa-b", null, false);
        when(places.details(eq("ChIJ-sa-a"), any())).thenReturn(Optional.of(
                new Place("ChIJ-sa-a", "A", 18.79, 73.34, null, List.of(), "Raigad")));
        when(places.details(eq("ChIJ-sa-b"), any())).thenReturn(Optional.of(
                new Place("ChIJ-sa-b", "B", 18.52, 73.85, null, List.of(), "Pune")));

        mvc.perform(post(Routes.ServedArea.ADMIN_RECHECK).header(HttpHeaders.AUTHORIZATION, token("staff")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checked").value(2))
                .andExpect(jsonPath("$.remaining").value(0));

        assertThat(district("zz-sa-a")).isEqualTo("Raigad");
        assertThat(district("zz-sa-b")).isEqualTo("Pune");
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'servedArea.recheck'",
                Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("a place Google no longer knows is marked checked with no district, so it shows as outside")
    void unknownPlaceIsOutside() throws Exception {
        locality("zz-sa-gone", "ChIJ-sa-gone", null, false);
        when(places.details(eq("ChIJ-sa-gone"), any())).thenReturn(Optional.empty());

        mvc.perform(post(Routes.ServedArea.ADMIN_RECHECK).header(HttpHeaders.AUTHORIZATION, token("admin")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.checked").value(1));
        mvc.perform(get(Routes.ServedArea.ADMIN).header(HttpHeaders.AUTHORIZATION, token("admin")))
                .andExpect(jsonPath("$.outside[?(@.slug == 'zz-sa-gone')].kind").value("locality"));
    }

    @Test
    @DisplayName("Google being down before anything is checked is a 503, and nothing is written")
    void googleDownIs503() throws Exception {
        locality("zz-sa-down", "ChIJ-sa-down", null, false);
        when(places.details(any(), any())).thenThrow(new PlacesLookup.UnavailableException("down", null));

        mvc.perform(post(Routes.ServedArea.ADMIN_RECHECK).header(HttpHeaders.AUTHORIZATION, token("admin")))
                .andExpect(status().isServiceUnavailable());
        assertThat(jdbc.queryForObject("select district_checked_at is null from localities where slug = 'zz-sa-down'",
                Boolean.class)).isTrue();
    }

    @Test
    @DisplayName("members and anonymous callers cannot see or run it")
    void membersAreRefused() throws Exception {
        String member = token("owner");
        mvc.perform(get(Routes.ServedArea.ADMIN).header(HttpHeaders.AUTHORIZATION, member))
                .andExpect(status().isForbidden());
        mvc.perform(post(Routes.ServedArea.ADMIN_RECHECK).header(HttpHeaders.AUTHORIZATION, member))
                .andExpect(status().isForbidden());
        mvc.perform(get(Routes.ServedArea.ADMIN)).andExpect(status().isUnauthorized());
    }
}
