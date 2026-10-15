package com.draazy.api.moderation.user;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;

@DisplayName("The people directory says which rows are archived")
class ArchivedUserRowTest extends AbstractApiTest {

    @Autowired UserRepository users;
    @PersistenceContext EntityManager em;

    private User person(String mobile, String role) {
        User user = new User(mobile, role);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    @Test
    void archivedFlagIsReportedAlongsideStatus() throws Exception {
        User admin = person("9877000401", Roles.Wire.ADMIN);
        User gone = person("9877000402", Roles.Wire.OWNER);
        User live = person("9877000403", Roles.Wire.OWNER);
        jdbc.update("update users set archived = true where id = ?", gone.getId());
                em.clear();
        mvc.perform(get(Routes.Users.BASE).param("archived", "true").param("q", gone.getMobile())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].archived").value(true));
        mvc.perform(get(Routes.Users.BASE).param("q", live.getMobile())
                        .header(HttpHeaders.AUTHORIZATION, bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].archived").value(false));
    }
}
