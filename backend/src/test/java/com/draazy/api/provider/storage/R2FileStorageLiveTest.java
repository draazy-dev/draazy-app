package com.draazy.api.provider.storage;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;

@EnabledIfEnvironmentVariable(named = "STORAGE_ENABLED", matches = "true")
class R2FileStorageLiveTest {
    @Test
    void privateBucketStoresAndReadsBackViaSignedUrl() throws Exception {
        R2Properties props = props();
        R2FileStorage storage = new R2FileStorage(props);
        String key = "it/" + UUID.randomUUID() + ".txt";
        byte[] body = ("draazy-r2-private-" + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8);

        try {
            storage.store(key, body, "text/plain");

            HttpResponse<byte[]> res = get(storage.signedDownloadUrl(key));

            assertThat(res.statusCode()).isEqualTo(200);
            assertThat(res.body()).isEqualTo(body);
        } finally {
            deleteQuietly(props, props.privateBucket(), key);
            storage.destroy();
        }
    }

    @Test
    void publicBucketStoresObjectAndReturnsCdnUrl() throws Exception {
        R2Properties props = props();
        R2FileStorage storage = new R2FileStorage(props);
        String key = "it/" + UUID.randomUUID() + ".txt";
        byte[] body = ("draazy-r2-public-" + UUID.randomUUID()).getBytes(StandardCharsets.UTF_8);

        try {
            String url = storage.storePublic(key, body, "text/plain");

            assertThat(url).isEqualTo(stripTrailingSlash(props.publicBaseUrl()) + "/" + key);

            byte[] readBack = readFromBucket(props, props.publicBucket(), key);
            assertThat(readBack).isEqualTo(body);
        } finally {
            deleteQuietly(props, props.publicBucket(), key);
            storage.destroy();
        }
    }

    private static byte[] readFromBucket(R2Properties props, String bucket, String key) {
        try (S3Client s3 = s3(props)) {
            return s3.getObjectAsBytes(
                    GetObjectRequest.builder().bucket(bucket).key(key).build()).asByteArray();
        }
    }

    private static HttpResponse<byte[]> get(String url) throws Exception {
        return HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create(url)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
    }

    private static R2Properties props() {
        return new R2Properties(
                true,
                require("R2_ENDPOINT"),
                require("R2_ACCESS_KEY_ID"),
                require("R2_SECRET_ACCESS_KEY"),
                require("R2_BUCKET_PUBLIC"),
                require("R2_BUCKET_PRIVATE"),
                require("R2_PUBLIC_BASE_URL"));
    }

    private static void deleteQuietly(R2Properties props, String bucket, String key) {
        try (S3Client s3 = s3(props)) {
            s3.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
        } catch (RuntimeException ignored) {
        }
    }

    private static S3Client s3(R2Properties props) {
        return S3Client.builder()
                .endpointOverride(URI.create(props.endpoint()))
                .region(Region.of("auto"))
                .credentialsProvider(StaticCredentialsProvider.create(
                        AwsBasicCredentials.create(props.accessKeyId(), props.secretAccessKey())))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .build();
    }

    private static String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }

    private static String require(String name) {
        String v = System.getenv(name);
        if (v == null || v.isBlank()) {
            throw new IllegalStateException("env var " + name + " must be set for the live R2 test");
        }
        return v;
    }
}
