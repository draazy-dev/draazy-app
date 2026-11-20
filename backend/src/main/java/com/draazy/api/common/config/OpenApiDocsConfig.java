package com.draazy.api.common.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class OpenApiDocsConfig implements WebMvcConfigurer {
    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addRedirectViewController("/", "/docs/index.html");
        registry.addRedirectViewController("/docs", "/docs/index.html");
        registry.addRedirectViewController("/swagger-ui", "/docs/index.html");
        registry.addRedirectViewController("/swagger-ui.html", "/docs/index.html");
    }
}
