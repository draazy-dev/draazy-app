package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Path;
import java.util.Properties;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;

// Sandbox copies prod rather than inheriting it, so parity is asserted here; values live in ProdProfileContractTest.
@DisplayName("The sandbox profile — a standalone copy that must not drift from prod")
class SandboxProfileContractTest {

    private static final Set<String> INTENTIONAL_DIVERGENCE = Set.of(
            // Sandbox adds classpath:db/seed for demo inventory, which makes its database unpromotable.
            "spring.flyway.locations");

    private static final Pattern PLACEHOLDER = Pattern.compile("\\$\\{([^}]+)}");

    /** See {@code ProdProfileContractTest.MODULE} — same working-directory hazard, same fix. */
    private static final Path MODULE = Path.of(System.getProperty("basedir", "")).toAbsolutePath();

    private static Properties mainResource(String name) throws IOException {
        Path file = MODULE.resolve("src/main/resources").resolve(name);
        assertThat(file)
                .as("run this from the backend module — the working directory was %s", MODULE)
                .exists();
        return PropertiesLoaderUtils.loadProperties(new FileSystemResource(file));
    }

    private static Properties prod() throws IOException {
        return mainResource("application-prod.properties");
    }

    private static Properties sandbox() throws IOException {
        return mainResource("application-sandbox.properties");
    }

    // Compares the complete maps so a new key is caught without anyone listing it as important.
    @Test
    @DisplayName("sandbox and prod agree on every key except the declared divergences")
    void sandboxDoesNotDriftFromProd() throws IOException {
        Properties prod = prod();
        Properties sandbox = sandbox();

        var differences = new TreeMap<String, String>();
        var allKeys = new TreeSet<String>();
        prod.stringPropertyNames().forEach(allKeys::add);
        sandbox.stringPropertyNames().forEach(allKeys::add);

        for (String key : allKeys) {
            if (INTENTIONAL_DIVERGENCE.contains(key)) {
                continue;
            }
            String inProd = prod.getProperty(key);
            String inSandbox = sandbox.getProperty(key);
            if (inProd == null) {
                differences.put(key, "only in sandbox (= '" + inSandbox + "')");
            } else if (inSandbox == null) {
                differences.put(key, "only in prod (= '" + inProd + "')");
            } else if (!inProd.equals(inSandbox)) {
                differences.put(key, "prod='" + inProd + "' but sandbox='" + inSandbox + "'");
            }
        }

        assertThat(differences)
                .as("sandbox is a standalone copy of prod, so an undeclared difference is drift, "
                        + "not configuration. Either copy the setting across, or add the key to "
                        + "INTENTIONAL_DIVERGENCE with a comment saying why sandbox is different. "
                        + "The dangerous direction is a hardening line added to prod alone: sandbox "
                        + "keeps passing its own tests while quietly ceasing to resemble the thing "
                        + "it exists to rehearse.")
                .isEmpty();
    }

    // A defaulted secret like ${DB_PASSWORD:} would boot sandbox against the base file's local Postgres.
    @Test
    @DisplayName("every secret is still an ${ENV} lookup with no fallback")
    void noSecretAcquiredADefaultDuringTheSplit() throws IOException {
        Properties sandbox = sandbox();
        var defaulted = new TreeSet<String>();

        for (String key : sandbox.stringPropertyNames()) {
            Matcher matcher = PLACEHOLDER.matcher(sandbox.getProperty(key));
            while (matcher.find()) {
                if (matcher.group(1).contains(":")) {
                    defaulted.add(key + " -> " + matcher.group());
                }
            }
        }

        assertThat(defaulted)
                .as("a default here turns a missing-secret boot failure into a silent fallback to "
                        + "the base file's development values")
                .isEmpty();
    }

    @Test
    @DisplayName("sandbox never loads the committed staff passwords and authenticator")
    void sandboxNeverSeedsStaffCredentials() throws IOException {
        assertThat(sandbox().getProperty("spring.flyway.locations")).doesNotContain("seed-staff");
    }

    @Test
    @DisplayName("the deploy checklist is exactly the same as prod's")
    void sandboxNeedsTheSameVariablesAsProd() throws IOException {
        assertThat(placeholdersIn(sandbox()))
                .as("if these sets diverge, one of the two deploy runbooks is now wrong")
                .isEqualTo(placeholdersIn(prod()));
    }

    private static Set<String> placeholdersIn(Properties properties) {
        var found = new TreeSet<String>();
        for (String key : properties.stringPropertyNames()) {
            Matcher matcher = PLACEHOLDER.matcher(properties.getProperty(key));
            while (matcher.find()) {
                found.add(matcher.group(1));
            }
        }
        return found;
    }
}
