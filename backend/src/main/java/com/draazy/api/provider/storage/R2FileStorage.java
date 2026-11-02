package com.draazy.api.provider.storage;

import com.draazy.api.provider.FileStorage;
import java.net.URI;
import java.time.Duration;
import java.util.Optional;
import java.util.stream.Stream;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Object;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

@Component
@ConditionalOnProperty(prefix = "draazy.providers.storage", name = "enabled", havingValue = "true")
class R2FileStorage implements FileStorage, DisposableBean {
    private static final Logger log = LoggerFactory.getLogger(R2FileStorage.class);

    private static final Duration URL_TTL = Duration.ofMinutes(15);

    private static final Duration ATTEMPT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration CALL_TIMEOUT = Duration.ofSeconds(20);

    private static final String PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";

    private final S3Client s3;
    private final S3Presigner presigner;
    private final String privateBucket;
    private final String publicBucket;
    private final String publicBaseUrl;

    @Autowired
    R2FileStorage(R2Properties props) {
        this(props, ATTEMPT_TIMEOUT, CALL_TIMEOUT);
    }

    R2FileStorage(R2Properties props, Duration attemptTimeout, Duration callTimeout) {
        if (isBlank(props.endpoint()) || isBlank(props.accessKeyId())
                || isBlank(props.secretAccessKey()) || isBlank(props.privateBucket())
                || isBlank(props.publicBucket()) || isBlank(props.publicBaseUrl())) {
            throw new IllegalStateException(
                    "draazy.providers.storage.enabled=true but endpoint/access-key-id/"
                            + "secret-access-key/private-bucket/public-bucket/public-base-url are "
                            + "not all set — refusing to start rather than accept objects R2 cannot "
                            + "keep or serve");
        }
        this.privateBucket = props.privateBucket();
        this.publicBucket = props.publicBucket();

        this.publicBaseUrl = stripTrailingSlash(props.publicBaseUrl());
        StaticCredentialsProvider creds = StaticCredentialsProvider.create(
                AwsBasicCredentials.create(props.accessKeyId(), props.secretAccessKey()));
        URI endpoint = URI.create(props.endpoint());
        S3Configuration cfg = S3Configuration.builder().pathStyleAccessEnabled(true).build();
        this.s3 = S3Client.builder()
                .endpointOverride(endpoint)
                .region(Region.of("auto"))
                .credentialsProvider(creds)
                .serviceConfiguration(cfg)
                .overrideConfiguration(ClientOverrideConfiguration.builder()
                        .apiCallAttemptTimeout(attemptTimeout)
                        .apiCallTimeout(callTimeout)
                        .build())
                .build();
        this.presigner = S3Presigner.builder()
                .endpointOverride(endpoint)
                .region(Region.of("auto"))
                .credentialsProvider(creds)
                .serviceConfiguration(cfg)
                .build();
        log.info("R2 object storage enabled (private bucket '{}', public bucket '{}')",
                privateBucket, publicBucket);
    }

    @Override
    public void store(String key, byte[] content, String contentType) {
        s3.putObject(
                PutObjectRequest.builder()
                        .bucket(privateBucket)
                        .key(key)
                        .contentType(contentType)
                        .build(),
                RequestBody.fromBytes(content));
    }

    @Override
    public String signedDownloadUrl(String key) {
        GetObjectPresignRequest req = GetObjectPresignRequest.builder()
                .signatureDuration(URL_TTL)
                .getObjectRequest(GetObjectRequest.builder().bucket(privateBucket).key(key).build())
                .build();
        return presigner.presignGetObject(req).url().toString();
    }

    @Override
    public void delete(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(privateBucket).key(key).build());
    }

    @Override
    public String storePublic(String key, byte[] content, String contentType) {
        s3.putObject(
                PutObjectRequest.builder()
                        .bucket(publicBucket)
                        .key(key)
                        .contentType(contentType)
                        .cacheControl(PUBLIC_CACHE_CONTROL)
                        .build(),
                RequestBody.fromBytes(content));
        return publicBaseUrl + "/" + key;
    }

    @Override
    public void deletePublic(String key) {
        s3.deleteObject(DeleteObjectRequest.builder().bucket(publicBucket).key(key).build());
    }

    @Override
    public Stream<String> listPublic(String prefix) {
        return s3.listObjectsV2Paginator(ListObjectsV2Request.builder().bucket(publicBucket).prefix(prefix).build())
                .contents()
                .stream()
                .map(S3Object::key);
    }

    @Override
    public Optional<byte[]> readPublic(String key) {
        try {
            return Optional.of(s3.getObjectAsBytes(GetObjectRequest.builder().bucket(publicBucket).key(key).build())
                    .asByteArray());
        } catch (NoSuchKeyException e) {
            return Optional.empty();
        }
    }

    @Override
    public String publicUrlPrefix() {
        return publicBaseUrl + "/";
    }

    @Override
    public void destroy() {
        s3.close();
        presigner.close();
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }

    private static String stripTrailingSlash(String s) {
        return s.endsWith("/") ? s.substring(0, s.length() - 1) : s;
    }
    }
