package com.draazy.api;

import java.util.Arrays;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.flyway.autoconfigure.FlywayAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;

@SpringBootApplication
@ConfigurationPropertiesScan
public class DraazyApiApplication {

    static final String MIGRATE_ONLY = "--migrate-only";

    public static void main(String[] args) {
        if (Arrays.asList(args).contains(MIGRATE_ONLY)) {
            System.exit(SpringApplication.exit(migrate(args)));
        }
        SpringApplication.run(DraazyApiApplication.class, args);
    }

    // Deployed profiles set spring.flyway.enabled=false, so the serving app never holds the schema-owner
    // credential; the migration job boots Flyway alone and re-enables it above every other source.
    static ConfigurableApplicationContext migrate(String... args) {
        return new SpringApplicationBuilder(FlywayAutoConfiguration.class)
                .web(WebApplicationType.NONE)
                .initializers(ctx -> ctx.getEnvironment().getPropertySources().addFirst(
                        new MapPropertySource(MIGRATE_ONLY, Map.of("spring.flyway.enabled", "true"))))
                .run(args);
    }
}
