package com.draazy.api.identity.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.provider.EmailSender;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

@DisplayName("Admin bootstrap input normalisation")
class AdminBootstrapInputTest {

    private static final Pattern LEGACY_EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    private static final List<String> EMAILS = List.of(
            "a@b.c", "a@b.co", "founder@example.com", "a@.b", "a@b.", "a@.", "a@..", "a@...", "a@.b.", "a@b..c",
            "a@b.c.d", "@b.c", "a@", "a", "", "a b@c.d", "a@b c.d", "a@b.c d", "a@@b.c", "a@b@c.d", "a@b.c@",
            "a.b@c.d", "a+tag@c.d", "\u00e9@\u00e9.\u00e9", "a@b.c\n", "a\n@b.c", "a@b\t.c", "a@b.c\u00a0",
            "a@" + ".".repeat(50), "a@" + "b".repeat(50) + ".", "a@" + "b".repeat(50) + ".c");

    private static AdminBootstrap bootstrap(String name, String baseUrl) {
        return new AdminBootstrap(mock(UserRepository.class), null, null, null, mock(JdbcTemplate.class),
                mock(EntityManager.class), mock(EmailSender.class), "founder@example.com", "9866043001", name,
                "", baseUrl, false);
    }

    @Test
    @DisplayName("the email check accepts and rejects exactly what the original pattern did")
    void emailPatternIsUnchanged() {
        Pattern current = (Pattern) ReflectionTestUtils.getField(AdminBootstrap.class, "EMAIL_FORMAT");

        for (String email : EMAILS) {
            assertThat(current.matcher(email).matches())
                    .as("email %s", email.replace("\n", "\\n"))
                    .isEqualTo(LEGACY_EMAIL.matcher(email).matches());
        }
    }

    @Test
    @DisplayName("the email check stays fast on a long run of dots")
    void emailPatternDoesNotBacktrack() {
        Pattern current = (Pattern) ReflectionTestUtils.getField(AdminBootstrap.class, "EMAIL_FORMAT");
        String hostile = "a@" + "b.".repeat(20_000) + " ";

        assertThat(org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(
                java.time.Duration.ofSeconds(2), () -> current.matcher(hostile).matches())).isFalse();
    }

    @Test
    @DisplayName("trailing slashes are dropped from the base url, however many, and null is empty")
    void baseUrlLosesTrailingSlashes() {
        assertThat(ReflectionTestUtils.getField(bootstrap("n", "http://x"), "baseUrl")).isEqualTo("http://x");
        assertThat(ReflectionTestUtils.getField(bootstrap("n", "http://x/"), "baseUrl")).isEqualTo("http://x");
        assertThat(ReflectionTestUtils.getField(bootstrap("n", "http://x///"), "baseUrl")).isEqualTo("http://x");
        assertThat(ReflectionTestUtils.getField(bootstrap("n", "  http://x/a/b//  "), "baseUrl"))
                .isEqualTo("http://x/a/b");
        assertThat(ReflectionTestUtils.getField(bootstrap("n", "///"), "baseUrl")).isEqualTo("");
        assertThat(ReflectionTestUtils.getField(bootstrap("n", null), "baseUrl")).isEqualTo("");
    }

    @Test
    @DisplayName("the admin name is trimmed, and a missing or blank one falls back to Administrator")
    void nameFallsBack() {
        assertThat(ReflectionTestUtils.getField(bootstrap("  Founder  ", "u"), "name")).isEqualTo("Founder");
        assertThat(ReflectionTestUtils.getField(bootstrap("   ", "u"), "name")).isEqualTo("Administrator");
        assertThat(ReflectionTestUtils.getField(bootstrap("", "u"), "name")).isEqualTo("Administrator");
        assertThat(ReflectionTestUtils.getField(bootstrap(null, "u"), "name")).isEqualTo("Administrator");
    }
}
