package com.draazy.api.provider.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("draazy.providers.storage")
public record R2Properties(
        boolean enabled,
        String endpoint,
        String accessKeyId,
        String secretAccessKey,
        String publicBucket,
        String privateBucket,
        String publicBaseUrl) {
    @Override
    public String toString() {
        return "R2Properties[enabled=" + enabled
                + ", endpoint=" + endpoint
                + ", accessKeyId=***, secretAccessKey=***"
                + ", publicBucket=" + publicBucket
                + ", privateBucket=" + privateBucket
                + ", publicBaseUrl=" + publicBaseUrl + "]";
    }
}
