package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

// The `local` profile is a claim; DRAAZY_DEV_MACHINE is the evidence. This control only fires once something has
// gone wrong, so these tests are the only thing that would notice it regress.
class LocalProfileGuardTest {

    private static final LocalProfileGuard.OsEnvironment UNSET = name -> null;
    private static final LocalProfileGuard.OsEnvironment ATTESTED = name ->
            LocalProfileGuard.DEV_MACHINE_VARIABLE.equals(name) ? "1" : null;

    @Test
    void localProfileOnAnAttestedMachineStartsNormally() {
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles("local"), ATTESTED, false))
                .doesNotThrowAnyException();
    }

    @Test
    void localProfileWithoutTheVariableRefusesToStart() {
        assertThatThrownBy(() -> LocalProfileGuard.assertDevMachineAttested(profiles("local"), UNSET, false))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage(LocalProfileGuard.missingAttestationMessage());
    }

    @Test
    void theFailureTellsADeveloperWhatToSetAndAnOperatorWhyNotTo() {
        // Developers and operators need opposite actions; "just set the variable" pasted into a crash-looping
        // server is exactly what the control exists to prevent.
        String message = LocalProfileGuard.missingAttestationMessage();

        assertThat(message)
                .contains("DRAAZY_DEV_MACHINE=1 once in your user environment")
                .contains("docs/LOCAL_DEV.md")
                .contains("Nothing in the repository sets it for you")
                .contains("this failure is the control working")
                .contains("Remove 'local' from spring.profiles.active");
    }

    @Test
    void aBlankValueIsNotAnAttestation() {
        // An empty or whitespace assignment, copied along with a shell profile, must not count as proof.
        assertThatThrownBy(() ->
                LocalProfileGuard.assertDevMachineAttested(profiles("local"), name -> "   ", false))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aPropertyEntryCannotStandInForTheEnvironmentVariable() {
        // The point of the control: no file may carry the signal. Relaxed binding would resolve either entry, so a
        // copied properties file or .env would pass if the check ever read the Environment instead of System.getenv.
        StandardEnvironment environment = profiles("local");
        environment.getPropertySources().addFirst(new MapPropertySource(
                "a-copied-application-local.properties",
                Map.of("DRAAZY_DEV_MACHINE", "1", "draazy.dev-machine", "1")));

        assertThat(environment.getProperty("DRAAZY_DEV_MACHINE")).isEqualTo("1");
        assertThatThrownBy(() -> LocalProfileGuard.assertDevMachineAttested(environment, UNSET, false))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void withoutTheLocalProfileTheVariableIsNotRequired() {
        // Without `local` nothing dangerous is registered, so there is nothing to attest to.
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles(), UNSET, false))
                .doesNotThrowAnyException();
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles("prod"), UNSET, false))
                .doesNotThrowAnyException();
    }

    @Test
    void theVariableOnANonLocalInstanceIsToleratedRatherThanFatal() {
        // A WARN, not a crash: no local-only bean is registered, and refusing to boot a healthy prod instance
        // over a stray variable would be a self-inflicted outage.
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles("prod"), ATTESTED, false))
                .doesNotThrowAnyException();
    }

    @Test
    void theBuildsOwnTestRunIsExempt_whichIsWhatKeepsTheSuiteGreen() {
        // The test properties activate `local` for the whole suite; exempting the test JVM beats committing the
        // variable, which would hand it to anyone who copies the repo.
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles("local"), UNSET, true))
                .doesNotThrowAnyException();

        // If spring-boot-test ever stops being the marker, this fails alone instead of every @SpringBootTest.
        assertThat(LocalProfileGuard.automatedTestRun()).isTrue();
    }

    @Test
    void aContextUnderTheLocalProfileStillRefreshes() {
        // End-to-end form of the above: the guard runs during refresh under `local`, on a machine that has
        // almost certainly not exported the variable.
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles(LocalProfileGuard.LOCAL_PROFILE);
            context.register(LocalProfileGuard.class);

            assertThatCode(context::refresh).doesNotThrowAnyException();
            assertThat(context.isActive()).isTrue();
        }
    }

    @Test
    void aDeploymentWithAnInsecureRefreshCookieRefusesToStart() {
        // Not a typo anyone makes directly: it is what `prod,local` resolves to, where profile order decides.
        // Asserted on the resolved property, as the guard reads it.
        assertThatThrownBy(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false"), "prod"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("thirty-day credential")
                .hasMessageContaining("check the ORDER of SPRING_PROFILES_ACTIVE");
    }

    @Test
    void aLoadBalancerIsEnoughToCountAsADeployment() {
        // Behind a proxy is on the public internet even without `prod`; deploymentEvidence is shared with the
        // local-bean guard so "deployment" has one definition.
        assertThatThrownBy(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false",
                "draazy.security.trusted-proxies", "10.0.0.0/8")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("a load balancer is in front of this instance");
    }

    @Test
    void sandboxIsADeploymentToo_whichStoppedBeingFreeWhenTheProfilesWereSplit() {
        // deploymentEvidence keys on the profile name and sandbox has trusted-proxies=none, so unless sandbox is
        // listed itself, a public environment with real credentials would silently pass as a laptop.
        assertThatThrownBy(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false"), "sandbox"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("the 'sandbox' profile is active");
    }

    @Test
    void aDeveloperMachineMayStillTurnSecureOff() {
        // Local dev is plain HTTP: a Secure cookie is never stored, so no session would outlive the access
        // token. This is why the guard is scoped to deployments.
        assertThatCode(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false")))
                .doesNotThrowAnyException();
    }

    @Test
    void secureByDefaultMeansAnUnsetPropertyIsNotAFinding() {
        // An environment that never mentions the property defaults to `true`, not to a misconfiguration.
        assertThatCode(() -> refreshWith(Map.of(), "prod"))
                .doesNotThrowAnyException();
    }

    @Test
    void e2eBesideLocalOnADeveloperMachineStarts() {
        assertThatCode(() -> refreshWith(Map.of(), "local", "e2e")).doesNotThrowAnyException();
    }

    @Test
    void e2eWithoutLocalRefusesToStart() {
        assertThatThrownBy(() -> refreshWith(Map.of(), "e2e"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("'e2e' profile is active without 'local'");
    }

    @Test
    void e2eBesideADeploymentProfileRefusesToStart() {
        assertThatThrownBy(() -> refreshWith(Map.of(), "local", "e2e", "sandbox"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("alongside the 'sandbox' deployment profile");
        assertThatThrownBy(() -> refreshWith(Map.of(), "prod", "e2e"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("alongside the 'prod' deployment profile");
    }

    /** Refreshes a context carrying just the guard, so the beans run exactly as they do at boot. */
    private static void refreshWith(Map<String, Object> properties, String... profiles) {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles(profiles);
            if (!properties.isEmpty()) {
                context.getEnvironment().getPropertySources()
                        .addFirst(new MapPropertySource("test", properties));
            }
            context.register(LocalProfileGuard.class);
            context.refresh();
        }
    }

    private static StandardEnvironment profiles(String... active) {
        StandardEnvironment environment = new StandardEnvironment();
        environment.setActiveProfiles(active);
        return environment;
    }
}
