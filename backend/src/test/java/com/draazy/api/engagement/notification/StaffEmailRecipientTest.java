package com.draazy.api.engagement.notification;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.security.Roles;
import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

@DisplayName("Staff alert emails go to live staff only, never to managers or admins")
class StaffEmailRecipientTest extends AbstractApiTest {
    @Autowired
    UserRepository users;

    @Test
    void onlyALiveStaffAccountWithAnEmailQualifies() {
        User staff = account("9820001001", Roles.Wire.STAFF, "staff@draazy.test");
        User manager = account("9820001002", Roles.Wire.MANAGER, "manager@draazy.test");
        User admin = account("9820001003", Roles.Wire.ADMIN, "admin@draazy.test");
        User suspended = account("9820001004", Roles.Wire.STAFF, "suspended@draazy.test");
        suspended.setStatus("suspended");
        users.saveAndFlush(suspended);
        User archived = account("9820001005", Roles.Wire.STAFF, "archived@draazy.test");
        jdbc.update("update users set archived = true where id = ?", archived.getId());
        User noEmail = account("9820001006", Roles.Wire.STAFF, null);

        assertThat(users.findLiveStaffEmail(staff.getId())).contains("staff@draazy.test");
        assertThat(users.findLiveStaffEmail(manager.getId())).isEmpty();
        assertThat(users.findLiveStaffEmail(admin.getId())).isEmpty();
        assertThat(users.findLiveStaffEmail(suspended.getId())).isEmpty();
        assertThat(users.findLiveStaffEmail(archived.getId())).isEmpty();
        assertThat(users.findLiveStaffEmail(noEmail.getId())).isEmpty();
    }

    private User account(String mobile, String role, String email) {
        User u = new User(mobile, role);
        u.setName("User " + mobile);
        u.setEmail(email);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }
}
