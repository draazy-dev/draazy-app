package com.draazy.api.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.support.AbstractApiTest;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;

@DisplayName("D120 — dev storage serves the bytes it stored")
class DevStorageTest extends AbstractApiTest {
    @Autowired
    FileStorage storage;

    @Value("${server.servlet.context-path:}")
    String contextPath;

    private String pathAndQuery(String url) {
        URI uri = URI.create(url);
        String path = uri.getRawPath();
        if (!contextPath.isEmpty() && path.startsWith(contextPath)) {
            path = path.substring(contextPath.length());
        }
        return path + "?" + uri.getRawQuery();
    }

    @Test
    @DisplayName("a signed download URL returns the stored bytes, with their content type")
    void signedUrlResolvesToTheBytes() throws Exception {
        String key = "documents/" + UUID.randomUUID() + "/" + UUID.randomUUID();
        storage.store(key, "%PDF-1.4 hello".getBytes(StandardCharsets.UTF_8), "application/pdf");

        String url = storage.signedDownloadUrl(key);
        assertThat(url).doesNotContain("mock.storage.local").contains(key);

        mvc.perform(get(pathAndQuery(url)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("application/pdf"))
                .andExpect(content().bytes("%PDF-1.4 hello".getBytes(StandardCharsets.UTF_8)));
    }

            @Test
            @DisplayName("a public object is unsigned, but an unsigned private object is still 404")
            void publicObjectsAreReadableWithoutExposingPrivateObjects() throws Exception {
            String publicKey = "photos/" + UUID.randomUUID() + "/living-room.png";
            String privateKey = "documents/" + UUID.randomUUID() + "/lease.pdf";
            byte[] publicBytes = "public-photo".getBytes(StandardCharsets.UTF_8);
            storage.store(privateKey, "private-document".getBytes(StandardCharsets.UTF_8), "application/pdf");

            String publicUrl = storage.storePublic(publicKey, publicBytes, "image/png");
            mvc.perform(get(pathAndQuery(publicUrl)))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("image/png"))
                .andExpect(content().bytes(publicBytes));

            mvc.perform(get("/dev/storage/" + privateKey))
                .andExpect(status().isNotFound());

            mvc.perform(get("/dev/storage/public/../" + privateKey))
                .andExpect(status().isBadRequest());
            }

    @Test
    @DisplayName("a forged signature, a swapped key and a lapsed deadline are all 404")
    void onlyAValidSignatureOpensIt() throws Exception {
        String key = "documents/" + UUID.randomUUID() + "/" + UUID.randomUUID();
        String other = "documents/" + UUID.randomUUID() + "/" + UUID.randomUUID();
        storage.store(key, "one".getBytes(StandardCharsets.UTF_8), "application/pdf");
        storage.store(other, "two".getBytes(StandardCharsets.UTF_8), "application/pdf");

        String signed = pathAndQuery(storage.signedDownloadUrl(key));
        String query = signed.substring(signed.indexOf('?'));

        mvc.perform(get(signed.substring(0, signed.lastIndexOf("&sig=")) + "&sig=deadbeef"))
                .andExpect(status().isNotFound());

        mvc.perform(get("/dev/storage/" + other + query))
                .andExpect(status().isNotFound());

        mvc.perform(get("/dev/storage/" + key + "?exp=1&sig=deadbeef"))
                .andExpect(status().isNotFound());
    }

    @Test
    @DisplayName("the content-type sidecar is not an object")
    void sidecarIsNotServed() throws Exception {
        String key = "documents/" + UUID.randomUUID() + "/" + UUID.randomUUID();
        storage.store(key, "one".getBytes(StandardCharsets.UTF_8), "application/pdf");

        String signed = pathAndQuery(storage.signedDownloadUrl(key));
        String query = signed.substring(signed.indexOf('?'));
        mvc.perform(get("/dev/storage/" + key + ".contenttype" + query))
                .andExpect(status().isNotFound());
    }
}
