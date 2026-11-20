package com.draazy.api.provider.cashfree;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("draazy.providers.cashfree")
public record CashfreeProperties(
        boolean enabled,
        String baseUrl,
        String appId,
        String secretKey,
        String notifyUrl) {
}
