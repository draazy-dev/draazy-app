package com.draazy.api;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;

@DisplayName("--migrate-only — the Cloud Run Job's entry point")
class MigrateOnlyModeTest {

    @Test
    @DisplayName("migrates even when the profile disables Flyway, and boots nothing else")
    void migratesWithoutTheServingApp() {
        try (ConfigurableApplicationContext ctx = DraazyApiApplication.migrate(
                DraazyApiApplication.MIGRATE_ONLY,
                "--spring.flyway.enabled=false",
                "--spring.flyway.url=${spring.datasource.url}",
                "--spring.flyway.user=${spring.datasource.username}",
                "--spring.flyway.password=${spring.datasource.password}")) {

            assertThat(ctx.getBean(Flyway.class).info().pending()).isEmpty();
            assertThat(ctx).isNotInstanceOf(WebServerApplicationContext.class);
            assertThat(Arrays.stream(ctx.getBeanDefinitionNames()).map(ctx::getType)
                            .filter(type -> type != null && type.getName().startsWith("com.draazy")))
                    .as("the job must not boot the app's beans, which need the serving secrets")
                    .isEmpty();
        }
    }
}
