package com.draazy.api.common.config;

import com.draazy.api.common.web.BuildStampFilter;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class CorsConfig {
    // Shared with RefreshOriginGate: both gate credentialed origins; copies would drift silently.
    public static final String ALLOWED_ORIGINS = "${draazy.web.cors.allowed-origins:http://localhost:5173}";

    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value(ALLOWED_ORIGINS) List<String> allowedOrigins) {
        CorsConfiguration cfg = new CorsConfiguration();
        cfg.setAllowedOrigins(allowedOrigins);
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setExposedHeaders(List.of(BuildStampFilter.BUILD_HEADER, HttpHeaders.ETAG));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
