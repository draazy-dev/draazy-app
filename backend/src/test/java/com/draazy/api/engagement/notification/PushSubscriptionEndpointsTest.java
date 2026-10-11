package com.draazy.api.engagement.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import com.draazy.api.support.AbstractApiTest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

@DisplayName("Push subscriptions — ownership, shape and quota")
class PushSubscriptionEndpointsTest extends AbstractApiTest {

    private static final String ENDPOINT = "https://push.example/sub/abc";

    @Autowired
    UserRepository users;

    private User user(String mobile) {
        User u = new User(mobile, "buyer");
        u.setName("Push " + mobile);
        u.setMobileVerified(true);
        return users.saveAndFlush(u);
    }

    private ResultActions subscribe(User caller, String endpoint, String p256dh, String auth) throws Exception {
        String body = "{\"endpoint\":\"" + endpoint + "\",\"keys\":{\"p256dh\":\"" + p256dh
                + "\",\"auth\":\"" + auth + "\"}}";
        return mvc.perform(post(Routes.Engagement.PUSH_SUBSCRIPTIONS)
                .header(HttpHeaders.AUTHORIZATION, bearer(caller))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private Map<String, Object> row(String endpoint) {
        return jdbc.queryForMap("select user_id, p256dh, auth from push_subscriptions where endpoint = ?", endpoint);
    }

    @Test
    @DisplayName("another account cannot take over an endpoint with different keys")
    void takeoverWithDifferentKeysIsRefused() throws Exception {
        User a = user("9810300001");
        User b = user("9810300002");
        subscribe(a, ENDPOINT, "keyA", "authA").andExpect(status().isNoContent());

        subscribe(b, ENDPOINT, "keyB", "authB")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("conflict"));
        subscribe(b, ENDPOINT, "keyA", "authB").andExpect(status().isConflict());
        subscribe(b, ENDPOINT, "keyB", "authA").andExpect(status().isConflict());

        assertThat(row(ENDPOINT)).containsEntry("user_id", a.getId()).containsEntry("p256dh", "keyA")
                .containsEntry("auth", "authA");
    }

    @Test
    @DisplayName("the same browser subscription follows the account that signs in on it")
    void sameKeysRebindsToTheNewAccount() throws Exception {
        User a = user("9810300003");
        User b = user("9810300004");
        subscribe(a, ENDPOINT, "keyA", "authA").andExpect(status().isNoContent());

        subscribe(b, ENDPOINT, "keyA", "authA").andExpect(status().isNoContent());

        assertThat(row(ENDPOINT)).containsEntry("user_id", b.getId());
    }

    @Test
    @DisplayName("the owner can rotate their own keys")
    void ownerRefreshesKeys() throws Exception {
        User a = user("9810300005");
        subscribe(a, ENDPOINT, "keyA", "authA").andExpect(status().isNoContent());

        subscribe(a, ENDPOINT, "keyA2", "authA2").andExpect(status().isNoContent());

        assertThat(row(ENDPOINT)).containsEntry("p256dh", "keyA2").containsEntry("auth", "authA2");
    }

    @Test
    @DisplayName("an endpoint must be an https URL within 2048 characters")
    void endpointShapeIsValidated() throws Exception {
        User a = user("9810300006");

        subscribe(a, "http://push.example/x", "k", "a").andExpect(status().isUnprocessableEntity());
        subscribe(a, "javascript:alert(1)", "k", "a").andExpect(status().isUnprocessableEntity());
        subscribe(a, "https://push.example/" + "x".repeat(2048), "k", "a")
                .andExpect(status().isUnprocessableEntity());
        subscribe(a, "https://push.example/" + "x".repeat(2000), "k", "a").andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("keys are capped at 256 and 64 characters")
    void keySizesAreCapped() throws Exception {
        User a = user("9810300007");

        subscribe(a, ENDPOINT, "k".repeat(257), "a").andExpect(status().isUnprocessableEntity());
        subscribe(a, ENDPOINT, "k", "a".repeat(65)).andExpect(status().isUnprocessableEntity());
        subscribe(a, ENDPOINT, "k".repeat(256), "a".repeat(64)).andExpect(status().isNoContent());
    }

    @Test
    @DisplayName("registering past ten keeps the ten newest and drops the oldest")
    void quotaDropsTheOldest() throws Exception {
        User a = user("9810300008");
        for (int i = 1; i <= 12; i++) {
            subscribe(a, "https://push.example/sub/" + i, "k", "a").andExpect(status().isNoContent());
            jdbc.update("update push_subscriptions set created_at = now() - (? * interval '1 minute')"
                    + " where endpoint = ?", 100 - i, "https://push.example/sub/" + i);
        }

        List<String> kept = jdbc.queryForList(
                "select endpoint from push_subscriptions where user_id = ?", String.class, a.getId());

        assertThat(kept).hasSize(10).doesNotContain("https://push.example/sub/1", "https://push.example/sub/2");
    }

    @Test
    @DisplayName("an oversized endpoint is rejected on delete instead of hitting the URL limit")
    void oversizedDeleteIsRejected() throws Exception {
        User a = user("9810300009");

        mvc.perform(delete(Routes.Engagement.PUSH_SUBSCRIPTIONS)
                        .param("endpoint", "https://push.example/" + "x".repeat(2100))
                        .header(HttpHeaders.AUTHORIZATION, bearer(a)))
                .andExpect(status().is4xxClientError());
    }
}