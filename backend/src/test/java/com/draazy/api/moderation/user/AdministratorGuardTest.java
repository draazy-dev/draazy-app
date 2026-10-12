package com.draazy.api.moderation.user;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.draazy.api.common.access.BackOfficeGrantRepository;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;

/** No operation may leave the platform with no live administrator. Archiving revokes the archived
 * account's token (V115), so the floor's remaining job is two administrators archiving each other at once. */
@DisplayName("D200 — the last-administrator floor")
class AdministratorGuardTest extends AbstractApiTest {

    @Autowired
    UserRepository users;

    @Autowired
    BackOfficeGrantRepository grants;

    @Autowired
    AdministratorGuard guard;

    // Each test counts administrators, so none may depend on the database; demoting keeps foreign keys intact.
    @BeforeEach
    void leaveNoOtherAdministrators() {
        jdbc.update("UPDATE users SET role = 'buyer' WHERE role = 'admin'");
    }

    private User admin(String mobile) {
        User user = new User(mobile, Roles.Wire.ADMIN);
        user.setName("Floor probe " + mobile);
        user.setMobileVerified(true);
        return users.saveAndFlush(user);
    }

    private int archive(User actor, User target) throws Exception {
        return mvc.perform(patch(Routes.Users.ARCHIVE.replace("{id}", target.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(actor))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"floor probe\"}"))
                .andReturn().getResponse().getStatus();
    }

    private int narrow(User actor, User target, String functions) throws Exception {
        return mvc.perform(put(Routes.Users.PERMISSIONS.replace("{id}", target.getId().toString()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(actor))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"functions\":%s}".formatted(functions)))
                .andReturn().getResponse().getStatus();
    }

    @AfterEach
    void clearCommittedAuditRows() {
        jdbc.update("DELETE FROM audit_log WHERE action IN "
                + "('user.archive', 'user.permissions.replace')");
    }

    @Test
    @DisplayName("an archived admin's token is dead, and the floor still refuses the last one")
    void archivingTheLastAdministratorIsRefused() throws Exception {
        User first = admin("9866050001");
        User second = admin("9866050002");

        assertThat(archive(first, second))
                .as("archiving a peer is fine while somebody is left")
                .isEqualTo(200);
        assertThat(archive(second, first))
                .as("archiving revoked the archived account's token")
                .isEqualTo(401);
        assertThatThrownBy(() -> guard.refuseIfLastAdministrator(users.findById(first.getId()).orElseThrow()))
                .isInstanceOf(ConflictException.class);

        assertThat(users.findById(first.getId()).orElseThrow().isArchived())
                .as("the refusal changed nothing")
                .isFalse();
    }

    @Test
    @DisplayName("the administrator cannot be narrowed")
    void theAdministratorIsNeverNarrowed() throws Exception {
        User first = admin("9866050003");
        User second = admin("9866050004");

        assertThat(narrow(second, first, "[\"kyc\"]")).isEqualTo(422);
        assertThat(grants.findById(first.getId())).isEmpty();
    }
    /** Nothing about a buyer or a moderator touches this guard. */
    @Test
    @DisplayName("the floor is silent about accounts that were never administrators")
    void theFloorIgnoresNonAdministrators() {
        User staff = new User("9866050011", Roles.Wire.STAFF);
        staff.setName("Floor probe staff");
        users.saveAndFlush(staff);

        assertThatCode(() -> guard.refuseIfLastAdministrator(staff)).doesNotThrowAnyException();
    }
}
