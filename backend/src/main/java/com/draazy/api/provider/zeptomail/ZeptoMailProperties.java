package com.draazy.api.provider.zeptomail;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("draazy.providers.zeptomail")
public record ZeptoMailProperties(
        boolean enabled,
        String baseUrl,
        String apiKey,
        String fromAddress,
        String fromName) {
    @Override
    public String toString() {
        return "ZeptoMailProperties[enabled=" + enabled
                + ", baseUrl=" + baseUrl
                + ", apiKey=" + (apiKey == null || apiKey.isBlank() ? "unset" : "<redacted>")
                + ", fromAddress=" + fromAddress
                + ", fromName=" + fromName + "]";
    }
}
