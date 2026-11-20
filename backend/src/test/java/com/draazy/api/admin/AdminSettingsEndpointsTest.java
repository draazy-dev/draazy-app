package com.draazy.api.admin;

import com.draazy.api.support.AbstractApiTest;

import static org.assertj.core.api.Assertions.assertThat;
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

class AdminSettingsEndpointsTest extends AbstractApiTest {
    @Autowired UserRepository users;
    @PersistenceContext EntityManager em;

    private String bearer(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Settings " + mobile.substring(6));
        u.setMobileVerified(true);
        return "Bearer " + jwtService.issueAccessToken(users.saveAndFlush(u));
    }

    private void save(String token, String body) throws Exception {
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk());
    }

    @Test
    void readReturnsTheStoredDocument() throws Exception {
        mvc.perform(get(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, bearer("9877710001", Roles.Wire.ADMIN)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fees").exists());
    }

    @Test
    void savingOneBlockDoesNotWipeTheOthers() throws Exception {
        String token = bearer("9877710002", Roles.Wire.ADMIN);
        save(token, "{\"flags\":{\"betaSearch\":true}}");

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.betaSearch").value(true))
                .andExpect(jsonPath("$.fees").exists());
    }

    @Test
    void changingOneFeeKeepsTheRest() throws Exception {
        String token = bearer("9877710003", Roles.Wire.ADMIN);
        save(token, "{\"fees\":{\"contactPack\":249,\"listingPass\":299,\"rentAgreementPlatform\":499}}");
        save(token, "{\"fees\":{\"rentAgreementPlatform\":999}}");

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fees.rentAgreementPlatform").value(999))
                .andExpect(jsonPath("$.fees.contactPack").value(249))
                .andExpect(jsonPath("$.fees.listingPass").value(299));
    }

    @Test
    void arraysAreReplacedWholesale() throws Exception {
        String token = bearer("9877710004", Roles.Wire.ADMIN);
        save(token, "{\"geo\":{\"city\":\"Pune\",\"blacklist\":[\"a\",\"b\"]}}");
        save(token, "{\"geo\":{\"blacklist\":[\"c\"]}}");

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.blacklist.length()").value(1))
                .andExpect(jsonPath("$.geo.blacklist[0]").value("c"))
                .andExpect(jsonPath("$.geo.city").value("Pune"));
    }

    @Test
    void aNullFieldRemovesItAndKeepsItsSiblings() throws Exception {
        String token = bearer("9877710011", Roles.Wire.ADMIN);
        save(token, "{\"geo\":{\"cities\":{\"Pune\":{\"center\":{\"lat\":1}},\"Mumbai\":{\"center\":{\"lat\":2}}}}}");
        save(token, "{\"geo\":{\"cities\":{\"Pune\":null}}}");

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.geo.cities.Pune").doesNotExist())
                .andExpect(jsonPath("$.geo.cities.Mumbai.center.lat").value(2));
    }

    @Test
    void theResponseIsTheMergedBlockNotThePatch() throws Exception {
        String token = bearer("9877710005", Roles.Wire.ADMIN);
        save(token, "{\"flags\":{\"w\":true}}");
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"x\":true}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.x").value(true))
                .andExpect(jsonPath("$.flags.w").value(true))
                .andExpect(jsonPath("$.fees").doesNotExist());
    }

    @Test
    void everyWriteIsAudited() throws Exception {
        String token = bearer("9877710006", Roles.Wire.ADMIN);
        save(token, "{\"flags\":{\"audited\":true}}");

        Integer rows = jdbc.queryForObject(
                "select count(*) from audit_log where action = 'settings.update'", Integer.class);
        org.assertj.core.api.Assertions.assertThat(rows).isPositive();
    }

    @Test
    void staffCannotReadOrWrite() throws Exception {
        String staff = bearer("9877710007", Roles.Wire.STAFF);
        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, staff))
                .andExpect(status().isForbidden());
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, staff)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"x\":true}}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void settingsAreNotPublic() throws Exception {
        mvc.perform(get(Routes.Admin.SETTINGS)).andExpect(status().isUnauthorized());
        mvc.perform(get(Routes.Admin.SETTINGS_FLAGS)).andExpect(status().isUnauthorized());
    }

    @Test
    void theFlagsReadReturnsOnlyTheAdminFlagsBlock() throws Exception {
        String token = bearer("9877710020", Roles.Wire.ADMIN);
        save(token, "{\"adminFlags\":{\"tickets\":{\"autoAssign\":true}},\"fees\":{\"rentAgreementPlatform\":321}}");

        mvc.perform(get(Routes.Admin.SETTINGS_FLAGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tickets.autoAssign").value(true))
                .andExpect(jsonPath("$.fees").doesNotExist())
                .andExpect(jsonPath("$.adminFlags").doesNotExist());
    }

    @Test
    void backOfficeReadsTheFlagsButACustomerDoesNot() throws Exception {
        mvc.perform(get(Routes.Admin.SETTINGS_FLAGS)
                        .header(HttpHeaders.AUTHORIZATION, bearer("9877710061", Roles.Wire.STAFF)))
                .andExpect(status().isOk());
        mvc.perform(get(Routes.Admin.SETTINGS_FLAGS)
                        .header(HttpHeaders.AUTHORIZATION, bearer("9877710062", Roles.Wire.MANAGER)))
                .andExpect(status().isOk());
        mvc.perform(get(Routes.Admin.SETTINGS_FLAGS)
                        .header(HttpHeaders.AUTHORIZATION, bearer("9877710063", Roles.Wire.BUYER)))
                .andExpect(status().isForbidden());
    }

    @Test
    void theWriteAckCarriesOnlyTheBlocksWritten() throws Exception {
        String token = bearer("9877710022", Roles.Wire.ADMIN);
        save(token, "{\"flags\":{\"seeded\":true}}");

        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fees\":{\"rentAgreementPlatform\":777}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fees.rentAgreementPlatform").value(777))
                .andExpect(jsonPath("$.flags").doesNotExist());
    }

    @Test
    void aSecondAdminEditingTheSameBlockIsRefusedRatherThanWinningSilently() throws Exception {
        String first = bearer("9877710010", Roles.Wire.ADMIN);
        String second = bearer("9877710011", Roles.Wire.ADMIN);

        String openedByBoth = etag(first);
        save(second, "{\"fees\":{\"rentAgreementPlatform\":999}}");

        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, first)
                        .header(HttpHeaders.IF_MATCH, openedByBoth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fees\":{\"rentAgreementPlatform\":499}}"))
                .andExpect(status().isPreconditionFailed())
                .andExpect(jsonPath("$.error").value("precondition_failed"));

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, first))
                .andExpect(jsonPath("$.fees.rentAgreementPlatform").value(999));
    }

    @Test
    void aCurrentEtagIsAcceptedAndTheNextOneMovesOn() throws Exception {
        String token = bearer("9877710012", Roles.Wire.ADMIN);
        String before = etag(token);

        String after = mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .header(HttpHeaders.IF_MATCH, before)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"conditional\":true}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.flags.conditional").value(true))
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);

        assertThat(after).isNotNull().isNotEqualTo(before);
        assertThat(etag(token)).isEqualTo(after);
    }

    @Test
    void aWriteThatChangesNothingLeavesTheTagAlone() throws Exception {
        String token = bearer("9877710013", Roles.Wire.ADMIN);
        save(token, "{\"flags\":{\"idempotent\":true}}");
        String tag = etag(token);

        save(token, "{\"flags\":{\"idempotent\":true}}");

        assertThat(etag(token)).isEqualTo(tag);
    }

    @Test
    void withoutIfMatchTheWriteIsUnconditional() throws Exception {
        String token = bearer("9877710014", Roles.Wire.ADMIN);
        save(token, "{\"fees\":{\"rentAgreementPlatform\":111}}");
        save(token, "{\"fees\":{\"rentAgreementPlatform\":222}}");

        mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(jsonPath("$.fees.rentAgreementPlatform").value(222));
    }

    @Test
    void ifMatchStarAlwaysPasses() throws Exception {
        String token = bearer("9877710015", Roles.Wire.ADMIN);

        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .header(HttpHeaders.IF_MATCH, "*")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"star\":true}}"))
                .andExpect(status().isOk());
    }

    @Test
    void anyEntryInTheListMatching_isEnough() throws Exception {
        String token = bearer("9877710016", Roles.Wire.ADMIN);
        String current = etag(token);

        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .header(HttpHeaders.IF_MATCH, "\"deadbeef\", " + current)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"listed\":true}}"))
                .andExpect(status().isOk());
    }

    @Test
    void aRefusedWriteIsNotAudited() throws Exception {
        String token = bearer("9877710017", Roles.Wire.ADMIN);
        Integer before = auditRows();

        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .header(HttpHeaders.IF_MATCH, "\"0123456789abcdef0123456789abcdef\"")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"flags\":{\"never\":true}}"))
                .andExpect(status().isPreconditionFailed());

        assertThat(auditRows()).isEqualTo(before);
    }

    @Test
    void theTagASaveReturnsStillMatchesAfterAFreshRead() throws Exception {
        String token = bearer("9877710030", Roles.Wire.ADMIN);
        String tag = mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"geo\":{\"enforceCityLimit\":false}}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);
        em.flush();
        em.clear();

        assertThat(etag(token)).isEqualTo(tag);
        mvc.perform(put(Routes.Admin.SETTINGS)
                        .header(HttpHeaders.AUTHORIZATION, token)
                        .header(HttpHeaders.IF_MATCH, tag)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"geo\":{\"enforceCityLimit\":true}}"))
                .andExpect(status().isOk());
    }

    private String etag(String token) throws Exception {
        return mvc.perform(get(Routes.Admin.SETTINGS).header(HttpHeaders.AUTHORIZATION, token))
                .andExpect(status().isOk())
                .andReturn().getResponse().getHeader(HttpHeaders.ETAG);
    }

    private Integer auditRows() {
        return jdbc.queryForObject(
                "select count(*) from audit_log where action = 'settings.update'", Integer.class);
    }
}
