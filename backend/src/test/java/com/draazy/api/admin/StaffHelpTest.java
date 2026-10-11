package com.draazy.api.admin;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("/admin/help/staff — staff runbooks for back-office roles only")
class StaffHelpTest extends AbstractApiTest {

    @Autowired UserRepository users;

    private String bearer(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Runbook Reader");
        u.setMobileVerified(true);
        return "Bearer " + jwtService.issueAccessToken(users.saveAndFlush(u));
    }

    @Test
    @DisplayName("staff, managers and admins read the staff-only sections, categories and articles")
    void backOfficeReads() throws Exception {
        String[][] readers = {
            {"9877740001", Roles.Wire.STAFF}, {"9877740002", Roles.Wire.MANAGER}, {"9877740003", Roles.Wire.ADMIN},
        };
        for (String[] reader : readers) {
            mvc.perform(get(Routes.Admin.HELP_STAFF).header(HttpHeaders.AUTHORIZATION, bearer(reader[0], reader[1])))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.sections[0].access").value("staff"))
                    .andExpect(jsonPath("$.articles[?(@.slug=='identity-review')]").exists());
        }
    }

    @Test
    @DisplayName("an anonymous caller is 401 and a consumer is 403")
    void othersRefused() throws Exception {
        mvc.perform(get(Routes.Admin.HELP_STAFF)).andExpect(status().isUnauthorized());
        mvc.perform(get(Routes.Admin.HELP_STAFF)
                        .header(HttpHeaders.AUTHORIZATION, bearer("9877740004", Roles.Wire.BUYER)))
                .andExpect(status().isForbidden());
        mvc.perform(get(Routes.Admin.HELP_STAFF)
                        .header(HttpHeaders.AUTHORIZATION, bearer("9877740005", Roles.Wire.OWNER)))
                .andExpect(status().isForbidden());
    }
}
