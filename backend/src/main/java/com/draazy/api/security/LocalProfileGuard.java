package com.draazy.api.security;

import java.util.Map;
import java.util.TreeSet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ListableBeanFactory;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.util.ClassUtils;

@Configuration
public class LocalProfileGuard {
    private static final Logger log = LoggerFactory.getLogger(LocalProfileGuard.class);

    public static final String LOCAL_PROFILE = "local";

    public static final String E2E_PROFILE = "e2e";

    public static final String NOT_LOCAL = "!" + LOCAL_PROFILE;

    public static final String DEV_MACHINE_VARIABLE = "DRAAZY_DEV_MACHINE";

    public static final String[] DEPLOYMENT_PROFILES =
            {LocalProfileGuard.PROD_PROFILE, LocalProfileGuard.SANDBOX_PROFILE};

    public static final String PROD_PROFILE = "prod";

    public static final String SANDBOX_PROFILE = "sandbox";

    public static String activeDeploymentProfile(Environment environment) {
        for (String profile : DEPLOYMENT_PROFILES) {
            if (environment.acceptsProfiles(Profiles.of(profile))) {
                return profile;
            }
        }
        return null;
    }

    private static final String TEST_FRAMEWORK_MARKER =
            "org.springframework.boot.test.context.SpringBootTest";

    private static final boolean AUTOMATED_TEST_RUN =
            ClassUtils.isPresent(TEST_FRAMEWORK_MARKER, LocalProfileGuard.class.getClassLoader());

    private static final String REFRESH_COOKIE_SECURE = "draazy.security.refresh-cookie.secure";

    @FunctionalInterface
    interface OsEnvironment {
        String read(String name);
    }

    @Bean
    SmartInitializingSingleton devMachineAttestationGuard(Environment environment) {
        return () -> assertDevMachineAttested(environment, System::getenv, AUTOMATED_TEST_RUN);
    }

    @Bean
    SmartInitializingSingleton secureCookieGuard(Environment environment) {
        return () -> {
            if (environment.getProperty(REFRESH_COOKIE_SECURE, Boolean.class, true)) {
                return;
            }
            String evidence = deploymentEvidence(environment);
            if (evidence == null) {
                return;
            }
            throw new IllegalStateException(
                    REFRESH_COOKIE_SECURE + " resolved to false on what looks like a real deployment ("
                            + evidence + "). The refresh cookie is a thirty-day credential; without "
                            + "Secure the browser will send it over plain HTTP, where anyone on the "
                            + "network path can read it, and it also loses the __Host- prefix that "
                            + "binds it to this host. Note that "
                            + "application-prod.properties sets this to true — if you did not set "
                            + "REFRESH_COOKIE_SECURE=false yourself, check the ORDER of "
                            + "SPRING_PROFILES_ACTIVE: the last profile to define a property wins, so "
                            + "'prod,local' takes the local value. Put 'prod' last, or drop 'local'.");
        };
    }

    @Bean
    SmartInitializingSingleton e2eProfileGuard(Environment environment) {
        return () -> assertE2eIsLocalOnly(environment);
    }

    static void assertE2eIsLocalOnly(Environment environment) {
        if (!environment.acceptsProfiles(Profiles.of(E2E_PROFILE))) {
            return;
        }
        String deployment = activeDeploymentProfile(environment);
        if (deployment == null && environment.acceptsProfiles(Profiles.of(LOCAL_PROFILE))) {
            return;
        }
        throw new IllegalStateException("The '" + E2E_PROFILE + "' profile is active"
                + (deployment != null ? " alongside the '" + deployment + "' deployment profile"
                        : " without '" + LOCAL_PROFILE + "'")
                + ". It seeds back-office accounts with known passwords and a fixed OTP code, so it is "
                + "valid only on a developer machine as '" + LOCAL_PROFILE + "," + E2E_PROFILE + "'. "
                + "Remove '" + E2E_PROFILE + "' from spring.profiles.active (SPRING_PROFILES_ACTIVE)"
                + (deployment == null ? ", or add '" + LOCAL_PROFILE + "'." : "."));
    }

    @Bean
    SmartInitializingSingleton localOnlyBeanGuard(ListableBeanFactory beans, Environment environment) {
        return () -> {
            Map<String, Object> devBeans = beans.getBeansWithAnnotation(LocalOnly.class);
            if (devBeans.isEmpty()) {
                return;
            }
            String evidence = deploymentEvidence(environment);
            if (evidence == null) {
                return;
            }
            throw new IllegalStateException(
                    "Development-only beans are registered on what looks like a real deployment ("
                            + evidence + "): " + new TreeSet<>(devBeans.keySet())
                            + ". These accept any OTP code, store uploads on local disk, and let any "
                            + "authenticated account grant itself the Verified badge that "
                            + "owners rely on to decide who may contact them. Remove '"
                            + LOCAL_PROFILE + "' from spring.profiles.active, or — if this really is a "
                            + "developer machine — unset draazy.security.trusted-proxies back to '"
                            + TrustedProxyConfig.NO_PROXY + "'.");
        };
    }

    static void assertDevMachineAttested(
            Environment environment, OsEnvironment osEnvironment, boolean automatedTestRun) {
        String attestation = osEnvironment.read(DEV_MACHINE_VARIABLE);
        boolean attested = attestation != null && !attestation.isBlank();

        if (!environment.acceptsProfiles(Profiles.of(LOCAL_PROFILE))) {
            if (attested) {
                log.warn("{} is set but the '{}' profile is not active. Nothing is weakened right "
                                + "now, but that variable is a security control meant to exist only "
                                + "on developer machines; if this is a server, unset it.",
                        DEV_MACHINE_VARIABLE, LOCAL_PROFILE);
            }
            return;
        }
        if (attested || automatedTestRun) {
            return;
        }
        throw new IllegalStateException(missingAttestationMessage());
    }

    static String missingAttestationMessage() {
        return "The '" + LOCAL_PROFILE + "' profile is active but the " + DEV_MACHINE_VARIABLE
                + " environment variable is not set, so nothing here proves this JVM is a "
                + "developer's machine.\n"
                + "  On a developer machine: set " + DEV_MACHINE_VARIABLE + "=1 once in your user "
                + "environment and start again — docs/LOCAL_DEV.md has the exact command. Nothing "
                + "in the repository sets it for you: not run-local.ps1, not the VS Code task, not "
                + ".env.local, because a control that a committed file can satisfy is not a "
                + "control.\n"
                + "  On a server this failure is the control working, and setting the variable is "
                + "the wrong fix: the '" + LOCAL_PROFILE + "' profile registers beans that accept any "
                + "six-digit OTP, write every OTP in plain text to the application log, store KYC "
                + "documents on the container's ephemeral disk, and expose an endpoint that lets "
                + "any authenticated account award itself the Verified badge that owners "
                + "use to decide who may contact them. Remove '" + LOCAL_PROFILE + "' from "
                + "spring.profiles.active (SPRING_PROFILES_ACTIVE) instead.\n"
                + "  " + DEV_MACHINE_VARIABLE + " is deliberately absent from every committed file, "
                + "so it cannot arrive by copying a .env, a Dockerfile or an "
                + "application*.properties, and it is read with System.getenv rather than through "
                + "the Spring Environment so that a property entry cannot satisfy it either.";
    }

    static boolean automatedTestRun() {
        return AUTOMATED_TEST_RUN;
    }

    private static String deploymentEvidence(Environment environment) {
        String profile = activeDeploymentProfile(environment);
        if (profile != null) {
            return "the '" + profile + "' profile is active";
        }
        String proxies = environment.getProperty(
                "draazy.security.trusted-proxies", TrustedProxyConfig.NO_PROXY).trim();
        if (!proxies.isEmpty() && !TrustedProxyConfig.NO_PROXY.equalsIgnoreCase(proxies)) {
            return "draazy.security.trusted-proxies=" + proxies
                    + ", so a load balancer is in front of this instance";
        }
        return null;
    }
}
