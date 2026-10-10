package com.draazy.api.security;

import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

abstract class AbstractSecurityTest extends AbstractApiTest {

    protected static final MediaType JSON = MediaType.APPLICATION_JSON;

    @Autowired
    protected UserRepository users;

    @PersistenceContext
    protected EntityManager em;

    private final List<String> actors = new ArrayList<>();

    /** Audit writes run REQUIRES_NEW and escape the test's rollback. */
    @AfterEach
    void removeEscapedAuditRows() {
        actors.forEach(actor -> jdbc.update("delete from audit_log where actor = ?", actor));
    }

    protected User user(String mobile, String role) {
        User u = new User(mobile, role);
        u.setName("Security " + mobile.substring(6));
        u.setMobileVerified(true);
        User saved = users.saveAndFlush(u);
        actors.add(saved.getId().toString());
        return saved;
    }

    /** Whole-row JSON, flushed first so a write the request left pending in the session cannot hide. */
    protected String row(String table, Object id) {
        em.flush();
        return jdbc.queryForObject("select to_jsonb(t)::text from " + table + " t where id = ?::uuid",
                String.class, id.toString());
    }

    protected int count(String sql, Object... args) {
        em.flush();
        return jdbc.queryForObject(sql, Integer.class, args);
    }

    protected static String idOf(String json) {
        return json.replaceAll("(?s)^.*?\"id\"\\s*:\\s*\"([^\"]+)\".*$", "$1");
    }

    protected static UUID uuid(String id) {
        return UUID.fromString(id);
    }
}
