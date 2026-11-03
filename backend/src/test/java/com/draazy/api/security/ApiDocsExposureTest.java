package com.draazy.api.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.io.IOException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;
import org.springframework.test.web.servlet.MockMvc;

@DisplayName("API docs — browsable on a dev machine, never from a deployment")
class ApiDocsExposureTest {
    private static final String SPEC = "/openapi/draazy-api.yaml";
    private static final String UI = "/docs/index.html";

    @Nested
    @SpringBootTest(properties = "draazy.security.public-api-docs=false")
    @AutoConfigureMockMvc
    class WhenDisabled {
        @Autowired
        MockMvc mvc;

        @Test
        void anonymousCallersCannotReadTheSpecOrTheUi() throws Exception {
            mvc.perform(get(SPEC)).andExpect(status().isUnauthorized());
            mvc.perform(get(UI)).andExpect(status().isUnauthorized());
            mvc.perform(get("/webjars/swagger-ui/5.25.3/swagger-ui.css")).andExpect(status().isUnauthorized());
        }
    }

    @Nested
    @SpringBootTest
    @AutoConfigureMockMvc
    class UnderTheLocalProfile {
        @Autowired
        MockMvc mvc;

        @Test
        void theSpecAndUiAreServed() throws Exception {
            mvc.perform(get(SPEC)).andExpect(status().isOk());
            mvc.perform(get(UI)).andExpect(status().isOk());
        }
    }

    @Test
    void everyDeploymentProfilePinsTheDocsOff() throws IOException {
        for (String profile : new String[] {"prod", "sandbox"}) {
            assertThat(PropertiesLoaderUtils.loadProperties(
                    new ClassPathResource("application-" + profile + ".properties"))
                    .getProperty("draazy.security.public-api-docs"))
                    .as(profile)
                    .isEqualTo("false");
        }
    }
}
