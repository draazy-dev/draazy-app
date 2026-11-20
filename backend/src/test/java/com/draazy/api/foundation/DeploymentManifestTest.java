package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.web.Routes;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

@DisplayName("The deployment manifests — the facts in them that no compiler checks")
class DeploymentManifestTest {

    private static final Path MODULE = Path.of(System.getProperty("basedir", "")).toAbsolutePath();

    private static final Pattern ENTRY = Pattern.compile(
            "- key: (\\w+)\\s*\\n\\s*(?:type: \\w+\\s*\\n\\s*)?value: \"?([^\"]+?)\"?\\s*(?:\\n|$)");

    private static final Pattern KEY = Pattern.compile("- key: (\\w+)");

    private static final Pattern REQUIRED_PLACEHOLDER = Pattern.compile("\\$\\{(\\w+)}");

    private static String read(String relative) throws IOException {
        Path file = MODULE.resolve(relative);
        assertThat(file)
                .as("run this from the backend module — the working directory was %s", MODULE)
                .exists();
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    private static String manifest(String env) throws IOException {
        return read("deploy/do-app-" + env + ".yaml");
    }

    private static String servicesBlock(String env) throws IOException {
        String all = manifest(env);
        int servicesIdx = all.indexOf("services:");
        int jobsIdx = all.indexOf("jobs:");
        return jobsIdx > servicesIdx ? all.substring(servicesIdx, jobsIdx) : all.substring(servicesIdx);
    }

    private static String jobsBlock(String env) throws IOException {
        String all = manifest(env);
        return all.substring(all.indexOf("jobs:"));
    }

    private static Set<String> keys(String block) {
        Set<String> found = new TreeSet<>();
        Matcher matcher = KEY.matcher(block);
        while (matcher.find()) {
            found.add(matcher.group(1));
        }
        return found;
    }

    private static String entry(String env, String variable) throws IOException {
        Matcher matcher = ENTRY.matcher(manifest(env));
        while (matcher.find()) {
            if (matcher.group(1).equals(variable)) {
                return matcher.group(2).trim();
            }
        }
        throw new AssertionError(variable + " is not set in deploy/do-app-" + env + ".yaml");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"sandbox", "prod"})
    @DisplayName("the deployed notify URL is the route this service actually serves")
    void theNotifyUrlMatchesTheRoute(String env) throws IOException {
        URI notifyUrl = URI.create(entry(env, "CASHFREE_NOTIFY_URL"));

        assertThat(notifyUrl.getPath())
                .as("CASHFREE_NOTIFY_URL is what Cashfree POSTs settlements to. It must be the "
                        + "context path plus Routes.Webhooks.CASHFREE_PAYMENT; anything else is a "
                        + "404 that looks exactly like 'payments stopped reconciling'.")
                .isEqualTo("/api" + Routes.Webhooks.CASHFREE_PAYMENT);
        assertThat(notifyUrl.getScheme()).isEqualTo("https");
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"sandbox", "prod"})
    @DisplayName("the API key and the webhook secret come from one entry, because they are one value")
    void theWebhookSecretIsTheApiKey(String env) throws IOException {
        assertThat(entry(env, "CASHFREE_WEBHOOK_SECRET"))
                .as("Cashfree signs webhooks with x-client-secret. Splitting these across two "
                        + "entries survives until the first rotation and then rejects every payment callback.")
                .isEqualTo(entry(env, "CASHFREE_SECRET_KEY"));
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"sandbox", "prod"})
    @DisplayName("the service never holds the schema-owner password; only the migration job does")
    void theServiceNeverHoldsTheSchemaOwnerPassword(String env) throws IOException {
        assertThat(servicesBlock(env))
                .as("code execution in the service would reach the owner role (docs/DEPLOY.md §2.1)")
                .doesNotContain("FLYWAY_DB_PASSWORD");
        assertThat(keys(jobsBlock(env))).contains("FLYWAY_DB_URL", "FLYWAY_DB_USER", "FLYWAY_DB_PASSWORD");
    }

    @Test
    @DisplayName("prod runs the prod profile on a managed production cluster, never sandbox's seeded data")
    void prodIsProd() throws IOException {
        assertThat(manifest("prod"))
                .as("the sandbox profile re-seeds fake listings and users (docs/DEPLOY.md §2)")
                .doesNotContain("value: sandbox")
                .contains("production: true")
                .contains("cluster_name:");
        assertThat(entry("prod", "SPRING_PROFILES_ACTIVE")).isEqualTo("prod");
        assertThat(entry("prod", "WEB_ORIGINS")).isEqualTo("https://draazy.com");
    }

    @Test
    @DisplayName("prod serves on the runtime role, not the schema owner")
    void prodServesOnTheRuntimeRole() throws IOException {
        assertThat(entry("prod", "DB_USER")).isEqualTo("draazy_app");
    }

    @Test
    @DisplayName("every required ${...} in application-prod.properties reaches the prod service")
    void everyProdPlaceholderIsSupplied() throws IOException {
        Set<String> required = new TreeSet<>();
        read("src/main/resources/application-prod.properties").lines()
                .filter(line -> !line.startsWith("#"))
                .forEach(line -> REQUIRED_PLACEHOLDER.matcher(line).results().forEach(m -> required.add(m.group(1))));
        // Flyway is off in the service; only the migrate job resolves these two.
        required.removeAll(Set.of("FLYWAY_DB_URL", "FLYWAY_DB_PASSWORD"));

        assertThat(keys(servicesBlock("prod")))
                .as("a missing one fails the boot after the deploy has started")
                .containsAll(required);
    }
}
