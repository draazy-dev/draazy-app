package com.draazy.api.provider.push;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("draazy.providers.push")
public record PushProperties(String vapidPublicKey, String vapidPrivateKey, String subject) {
    @Override
    public String toString() {
        return "PushProperties[vapidPublicKey=" + vapidPublicKey
                + ", vapidPrivateKey=" + (vapidPrivateKey == null || vapidPrivateKey.isBlank()
                        ? "unset" : "<redacted>")
                + ", subject=" + subject + "]";
    }
}
