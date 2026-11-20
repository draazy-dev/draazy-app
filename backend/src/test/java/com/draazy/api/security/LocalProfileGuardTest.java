package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;

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
        assertThatThrownBy(() ->
                LocalProfileGuard.assertDevMachineAttested(profiles("local"), name -> "   ", false))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void aPropertyEntryCannotStandInForTheEnvironmentVariable() {
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
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles(), UNSET, false))
                .doesNotThrowAnyException();
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles("prod"), UNSET, false))
                .doesNotThrowAnyException();
    }

    @Test
    void theVariableOnANonLocalInstanceIsToleratedRatherThanFatal() {
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles("prod"), ATTESTED, false))
                .doesNotThrowAnyException();
    }

    @Test
    void theBuildsOwnTestRunIsExempt_whichIsWhatKeepsTheSuiteGreen() {
        assertThatCode(() -> LocalProfileGuard.assertDevMachineAttested(profiles("local"), UNSET, true))
                .doesNotThrowAnyException();

        assertThat(LocalProfileGuard.automatedTestRun()).isTrue();
    }

    @Test
    void aContextUnderTheLocalProfileStillRefreshes() {
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            context.getEnvironment().setActiveProfiles(LocalProfileGuard.LOCAL_PROFILE);
            context.register(LocalProfileGuard.class);

            assertThatCode(context::refresh).doesNotThrowAnyException();
            assertThat(context.isActive()).isTrue();
        }
    }

    @Test
    void aDeploymentWithAnInsecureRefreshCookieRefusesToStart() {
        assertThatThrownBy(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false"), "prod"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("thirty-day credential")
                .hasMessageContaining("check the ORDER of SPRING_PROFILES_ACTIVE");
    }

    @Test
    void aLoadBalancerIsEnoughToCountAsADeployment() {
        assertThatThrownBy(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false",
                "draazy.security.trusted-proxies", "10.0.0.0/8")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("a load balancer is in front of this instance");
    }

    @Test
    void sandboxIsADeploymentToo_whichStoppedBeingFreeWhenTheProfilesWereSplit() {
        assertThatThrownBy(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false"), "sandbox"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("the 'sandbox' profile is active");
    }

    @Test
    void aDeveloperMachineMayStillTurnSecureOff() {
        assertThatCode(() -> refreshWith(Map.of(
                "draazy.security.refresh-cookie.secure", "false")))
                .doesNotThrowAnyException();
    }

    @Test
    void secureByDefaultMeansAnUnsetPropertyIsNotAFinding() {
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
