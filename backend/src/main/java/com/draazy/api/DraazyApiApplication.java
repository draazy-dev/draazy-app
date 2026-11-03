package com.draazy.api;

import java.util.Arrays;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;

// Auth is JWT and staff sign-in; the default in-memory `user` only logs a usable password at boot.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class DraazyApiApplication {
    static final String MIGRATE_ONLY = "--migrate-only";

    public static void main(String[] args) {
        if (Arrays.asList(args).contains(MIGRATE_ONLY)) {
            System.exit(SpringApplication.exit(migrate(args)));
        }
        SpringApplication.run(DraazyApiApplication.class, args);
    }

    // Deployed profiles disable Flyway so the serving app never holds the schema-owner credential.
    // The migration job boots Flyway alone and re-enables it above every other property source.
    static ConfigurableApplicationContext migrate(String... args) {
        return new SpringApplicationBuilder(FlywayAutoConfiguration.class)
                .web(WebApplicationType.NONE)
                .initializers(ctx -> ctx.getEnvironment().getPropertySources().addFirst(
                        new MapPropertySource(MIGRATE_ONLY, Map.of("spring.flyway.enabled", "true"))))
                .run(args);
    }
}
