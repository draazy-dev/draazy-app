package com.draazy.api.common.persistence;

import com.draazy.api.security.LocalProfileGuard;
import jakarta.annotation.PostConstruct;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Refuses to boot a deployment whose runtime database role could run DDL (docs/DEPLOY.md §2.1). */
@Component
@Profile(LocalProfileGuard.PROD_PROFILE + " | " + LocalProfileGuard.SANDBOX_PROFILE)
public class DatabasePrivilegeCheck {

    private static final Logger log = LoggerFactory.getLogger(DatabasePrivilegeCheck.class);

    private static final String GRANTS_SQL = """
            SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolbypassrls,
                   has_schema_privilege(current_user, 'public', 'CREATE'),
                   EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tableowner = current_user)
            FROM pg_roles r WHERE r.rolname = current_user""";

    record Grants(boolean elevatedRole, boolean canCreate, boolean ownsTables) {
        List<String> problems() {
            List<String> out = new ArrayList<>();
            if (elevatedRole) {
                out.add("is superuser, CREATEDB, CREATEROLE or BYPASSRLS");
            }
            if (canCreate) {
                out.add("may CREATE in schema public");
            }
            if (ownsTables) {
                out.add("owns tables in schema public");
            }
            return out;
        }
    }

    private final JdbcTemplate jdbc;
    private final String runtimeUser;
    private final String flywayUser;

    DatabasePrivilegeCheck(JdbcTemplate jdbc,
            @Value("${spring.datasource.username}") String runtimeUser,
            @Value("${spring.flyway.user}") String flywayUser) {
        this.jdbc = jdbc;
        this.runtimeUser = runtimeUser;
        this.flywayUser = flywayUser;
    }

    @PostConstruct
    void verify() {
        Grants grants = jdbc.queryForObject(GRANTS_SQL,
                (rs, n) -> new Grants(rs.getBoolean(1), rs.getBoolean(2), rs.getBoolean(3)));
        judge(grants, runtimeUser, flywayUser);
    }

    static void judge(Grants grants, String runtimeUser, String flywayUser) {
        List<String> problems = grants.problems();
        if (problems.isEmpty()) {
            log.info("Runtime database role is DML-only");
            return;
        }
        String message = "Runtime database role " + problems + "; point DB_USER at the DML-only role "
                + "(docs/DEPLOY.md §2.1)";
        // Until the owner splits the roles both users are still postgres, and refusing would block that deploy.
        if (runtimeUser.equals(flywayUser)) {
            log.warn(message);
            return;
        }
        throw new IllegalStateException(message);
    }
}
