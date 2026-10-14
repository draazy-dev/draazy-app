package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.support.AbstractApiTest;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Manager role migration")
class ManagerRoleMigrationTest extends AbstractApiTest {

    @Test
    void managerIsAcceptedByEveryRoleCheckConstraint() {
        assertThat(constraint("users_role_check")).contains("'manager'");
        assertThat(constraint("audit_log_actor_role_check")).contains("'manager'");
        assertThat(constraint("messages_author_role_check")).contains("'manager'");
        assertThat(constraint("service_request_messages_author_role_check")).contains("'manager'");
        assertThat(constraint("support_ticket_messages_author_role_check")).contains("'manager'");
    }

    private String constraint(String name) {
        return jdbc.queryForObject(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = ?",
                String.class, name);
    }
}
