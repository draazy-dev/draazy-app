package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.web.Routes;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("The sandbox deployment manifest — the facts in it that no compiler checks")
class SandboxDeploymentManifestTest {

    /** See {@code ProdProfileContractTest.MODULE} — same working-directory hazard, same fix. */
    private static final Path MODULE = Path.of(System.getProperty("basedir", "")).toAbsolutePath();

    // Not a YAML parse: the file is an envsubst template a parser would choke on.
    private static final Pattern ENTRY = Pattern.compile(
            "- name: (\\w+)\\s*\\n\\s*(?:value: (.+)|valueFrom:\\s*\\n\\s*secretKeyRef:\\s*\\n\\s*name: (\\S+))");

    private static String manifest() throws IOException {
        Path file = MODULE.resolve("deploy/cloudrun-sandbox.yaml");
        assertThat(file)
                .as("run this from the backend module — the working directory was %s", MODULE)
                .exists();
        return Files.readString(file, StandardCharsets.UTF_8);
    }

    /** The literal value, or the Secret Manager entry name, for one environment variable. */
    private static String entry(String variable) throws IOException {
        Matcher matcher = ENTRY.matcher(manifest());
        while (matcher.find()) {
            if (matcher.group(1).equals(variable)) {
                return matcher.group(2) != null ? matcher.group(2).trim() : matcher.group(3).trim();
            }
        }
        throw new AssertionError(variable + " is not set in deploy/cloudrun-sandbox.yaml");
    }

    // Nothing else ties this string to the route constant; `/api` is the context path, easy to drop.
    @Test
    @DisplayName("the deployed notify URL is the route this service actually serves")
    void theNotifyUrlMatchesTheRoute() throws IOException {
        URI notifyUrl = URI.create(entry("CASHFREE_NOTIFY_URL"));

        assertThat(notifyUrl.getPath())
                .as("CASHFREE_NOTIFY_URL is what Cashfree POSTs settlements to. It must be the "
                        + "context path plus Routes.Webhooks.CASHFREE_PAYMENT; anything else is a "
                        + "404 that looks exactly like 'payments stopped reconciling'.")
                .isEqualTo("/api" + Routes.Webhooks.CASHFREE_PAYMENT);
        assertThat(notifyUrl.getScheme()).isEqualTo("https");
    }

    @Test
    @DisplayName("the API key and the webhook secret come from one entry, because they are one value")
    void theWebhookSecretIsTheApiKey() throws IOException {
        assertThat(entry("CASHFREE_WEBHOOK_SECRET"))
                .as("Cashfree signs webhooks with x-client-secret. Splitting these across two "
                        + "Secret Manager entries survives until the first rotation and then "
                        + "rejects every payment callback, silently and permanently.")
                .isEqualTo(entry("CASHFREE_SECRET_KEY"));
    }

    @Test
    @DisplayName("the service never holds the schema-owner password; only the migration job does")
    void theServiceNeverHoldsTheSchemaOwnerPassword() throws IOException {
        assertThat(manifest())
                .as("code execution in the service would reach the owner role (docs/DEPLOY.md §2.1)")
                .doesNotContain("FLYWAY_DB_PASSWORD")
                .doesNotContain("draazy-sandbox-flyway-db-password");
    }
}
