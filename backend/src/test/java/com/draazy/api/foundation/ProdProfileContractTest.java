package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.springframework.mock.env.MockEnvironment;

@DisplayName("The prod profile — a contract nothing else in the suite loads")
class ProdProfileContractTest {
    private static final Set<String> REQUIRED_DEPLOY_VARIABLES = Set.of(
            "DB_URL",
            "DB_USER",
            "DB_PASSWORD",
            "JWT_SECRET",
            "WEB_ORIGINS",
            "CASHFREE_WEBHOOK_SECRET",
            "INTERNAL_PROXIES",

            "REFERRAL_SIGNAL_SALT",

            "IDENTITY_HASH_SECRET",

            "IDENTITY_ENCRYPTION_KEY",
            "IDENTITY_ENCRYPTION_KEY_ID",

            "STAFF_TOTP_KEY",

            "FLYWAY_DB_URL",

            "FLYWAY_DB_USER",
            "FLYWAY_DB_PASSWORD",

            "API_PUBLIC_ORIGIN",

            "ORIGIN_SHARED_SECRET");

    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([^}]+)}");

    private static final Path MODULE = Path.of(System.getProperty("basedir", "")).toAbsolutePath();

    private static Properties load(String resource) throws IOException {
        return PropertiesLoaderUtils.loadProperties(new ClassPathResource(resource));
    }

    private static Properties mainResource(String name) throws IOException {
        Path file = MODULE.resolve("src/main/resources").resolve(name);
        assertThat(file)
                .as("run this from the backend module — the working directory was %s", MODULE)
                .exists();
        return PropertiesLoaderUtils.loadProperties(new FileSystemResource(file));
    }

    private static Properties prod() throws IOException {
        return load("application-prod.properties");
    }

    private static Set<String> placeholdersIn(Properties properties) {
        Set<String> names = new TreeSet<>();
        for (String key : properties.stringPropertyNames()) {
            Matcher matcher = PLACEHOLDER.matcher(properties.getProperty(key));
            while (matcher.find()) {
                String placeholder = matcher.group(1);
                int separator = placeholder.indexOf(':');
                names.add(separator < 0 ? placeholder : placeholder.substring(0, separator));
            }
        }
        return names;
    }

    @Test
    @DisplayName("the file exists and is loadable at all")
    void theProdProfileIsOnTheClasspath() throws IOException {
        assertThat(prod()).isNotEmpty();
    }

    @Test
    @DisplayName("it requires exactly the documented deploy variables — no more, no fewer")
    void theRequiredEnvironmentIsExactlyWhatIsDocumented() throws IOException {
        assertThat(placeholdersIn(prod()))
                .as("a new ${ENV} lookup here is a new mandatory deploy input; say so out loud")
                .containsExactlyInAnyOrderElementsOf(REQUIRED_DEPLOY_VARIABLES);
    }

    @Test
    @DisplayName("the keys carrying those variables are spelled the way the app reads them")
    void noSecretBearingKeyIsMisspelledOrMissing() throws IOException {
        assertThat(prod())
                .as("a key the app never reads is inert, and inert means the base file's value wins")
                .containsKeys(
                        "spring.datasource.url",
                        "spring.datasource.username",
                        "spring.datasource.password",

                        "spring.flyway.url",
                        "spring.flyway.user",
                        "spring.flyway.password",
                        "draazy.security.jwt.secret",
                        "draazy.web.cors.allowed-origins",
                        "draazy.webhooks.cashfree.secret",
                        "draazy.security.trusted-proxies",
                        "draazy.security.origin-secret");
    }

    @Test
    @DisplayName("none of them carries a fallback default")
    void noSecretHasADefaultToSilentlyFallBackTo() throws IOException {
        Properties prod = prod();
        for (String key : prod.stringPropertyNames()) {
            String value = prod.getProperty(key);
            Matcher matcher = PLACEHOLDER.matcher(value);
            while (matcher.find()) {
                assertThat(matcher.group(1))
                        .as("%s must fail the boot when unset, not fall back to a default", key)
                        .doesNotContain(":");
            }
        }
    }

    @Test
    @DisplayName("the refresh cookie is Secure in prod")
    void theRefreshCookieIsSecure() throws IOException {
        assertThat(prod().getProperty("draazy.security.refresh-cookie.secure"))
                .as("a non-Secure refresh cookie fails silently — no boot error, no failed request")
                .isEqualTo("true");
    }

    @Test
    @DisplayName("the serving app never migrates — only the --migrate-only job does")
    void theServingAppNeverMigrates() throws IOException {
        assertThat(prod().getProperty("spring.flyway.enabled"))
                .as("migrating at boot puts the schema-owner password in every instance (docs/DEPLOY.md §2.1)")
                .isEqualTo("false");
    }

    @Test
    @DisplayName("prod requires the API's own public origin")
    void theApiPublicOriginIsRequiredInProd() throws IOException {
        assertThat(prod().getProperty("draazy.web.public-origin"))
                .as("the delivery check has nothing to compare against without it")
                .isEqualTo("${API_PUBLIC_ORIGIN}");
    }

    @Test
    @DisplayName("a deploy that supplies all of them resolves cleanly")
    void theContractIsSatisfiableByTheDocumentedSet() throws IOException {
        MockEnvironment environment = environmentSupplying(REQUIRED_DEPLOY_VARIABLES);
        Properties prod = prod();

        for (String key : prod.stringPropertyNames()) {
            assertThatCode(() -> environment.resolveRequiredPlaceholders(prod.getProperty(key)))
                    .as("%s should resolve once the documented variables are present", key)
                    .doesNotThrowAnyException();
        }
    }

    @Test
    @DisplayName("omitting any single one fails resolution rather than defaulting")
    void everyMissingVariableIsFatal() throws IOException {
        Properties prod = prod();

        for (String omitted : REQUIRED_DEPLOY_VARIABLES) {
            Set<String> supplied = new TreeSet<>(REQUIRED_DEPLOY_VARIABLES);
            supplied.remove(omitted);
            MockEnvironment environment = environmentSupplying(supplied);

            String dependentValue = prod.stringPropertyNames().stream()
                    .map(prod::getProperty)
                    .filter(value -> value.contains("${" + omitted + "}"))
                    .findFirst()
                    .orElseThrow(() -> new AssertionError(
                            omitted + " is listed as required but no property in the file reads it"));

            assertThatThrownBy(() -> environment.resolveRequiredPlaceholders(dependentValue))
                    .as("a deploy that forgot %s must not start", omitted)
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining(omitted);
        }
    }

    @Test
    @DisplayName("Flyway runs the schema only, never the demo seed")
    void productionNeverRunsTheLocalSeed() throws IOException {
        assertThat(prod().getProperty("spring.flyway.locations"))
                .as("a `local,prod` deploy must still resolve to migration-only")
                .isEqualTo("classpath:db/migration");

        assertThat(mainResource("application-local.properties").getProperty("spring.flyway.locations"))
                .as("this is what the prod override above exists to beat")
                .contains("db/seed");
    }

    @Test
    @DisplayName("redirects stay relative in every profile, since the container only sees the proxy's host")
    void redirectsAreRelative() throws IOException {
        assertThat(mainResource("application.properties").getProperty("server.tomcat.use-relative-redirects"))
                .isEqualTo("true");
    }

    @Test
    @DisplayName("the OTP throttle is re-pinned to its secure values")
    void theOtpBudgetIsNotInheritedFromTheLoosenedLocalProfile() throws IOException {
        Properties prod = prod();

        assertThat(prod.getProperty("draazy.otp.send-cooldown-seconds")).isEqualTo("60");
        assertThat(prod.getProperty("draazy.otp.max-sends-per-window")).isEqualTo("5");

        Properties local = mainResource("application-local.properties");
        assertThat(local.getProperty("draazy.otp.max-sends-per-window"))
                .as("if local is no longer the loosened profile, this override needs re-reading")
                .isNotEqualTo("5");
    }

    @Test
    @DisplayName("the actuator surface stays minimal and the logs stay machine-readable")
    void theOperationalSurfaceIsWhatTheDeploymentExpects() throws IOException {
        Properties prod = prod();

        assertThat(prod.getProperty("management.endpoints.web.exposure.include"))
                .as("anything beyond health is an unauthenticated information leak — `info` "
                        + "publishes build, git and Java-version detail, and the platform's probes "
                        + "never ask for it")
                .isEqualTo("health");
        assertThat(prod.getProperty("management.endpoint.health.probes.enabled")).isEqualTo("true");
        assertThat(prod.getProperty("logging.structured.format.console"))
                .as("the log pipeline parses ECS JSON; plain text arrives as unqueryable blobs")
                .isEqualTo("ecs");
    }

    @Test
    @DisplayName("the app listens on the port its platform assigns it")
    void theListenPortIsTakenFromTheEnvironment() throws IOException {
        assertThat(mainResource("application.properties").getProperty("server.port"))
                .as("the platform health-checks the port it injects; a fixed port never gets traffic")
                .isEqualTo("${PORT:8080}");
    }

    @Test
    @DisplayName("the public repo's well-known dev keys apply only under `local`")
    void signingAndEncryptionKeysHaveNoDefaultOutsideLocal() throws IOException {
        Properties base = mainResource("application.properties");
        Properties local = mainResource("application-local.properties");
        for (String key : List.of("draazy.security.jwt.secret", "draazy.security.referral-signal-salt",
                "draazy.security.identity-hash-secret", "draazy.security.identity-key",
                "draazy.security.identity-key-id", "draazy.security.staff-totp-key")) {
            assertThat(base.getProperty(key))
                    .as("%s: a profile-less boot must fail, not sign tokens with a key anyone can read", key)
                    .matches("\\$\\{[A-Z_]+}");
            assertThat(local.getProperty(key)).as("%s keeps a dev default so local boots", key).contains(":");
        }
    }

    private static MockEnvironment environmentSupplying(Set<String> variables) {
        MockEnvironment environment = new MockEnvironment();
        variables.forEach(name -> environment.setProperty(name, name));
        return environment;
    }
}
