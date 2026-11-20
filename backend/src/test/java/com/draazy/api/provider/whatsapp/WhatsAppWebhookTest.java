package com.draazy.api.provider.whatsapp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.provider.ProviderCalls;
import com.draazy.api.support.AbstractApiTest;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = {
        "draazy.providers.whatsapp.app-secret=test-app-secret",
        "draazy.providers.whatsapp.webhook-verify-token=test-verify-token-0123"})
@DisplayName("WhatsApp webhook — signed STOP/START replies and delivery failures")
class WhatsAppWebhookTest extends AbstractApiTest {

    private static final String MOBILE = "9811122233";

    @Autowired
    WhatsAppWebhookSignature signature;

    @Autowired
    WhatsAppOptOuts optOuts;

    @MockitoSpyBean
    ProviderCalls calls;

    private static String reply(String text, long sentAtSeconds) {
        return """
                {"object":"whatsapp_business_account","entry":[{"changes":[{"field":"messages","value":{
                 "messages":[{"from":"91%s","id":"wamid.x","timestamp":"%d","type":"text","text":{"body":"%s"}}]}}]}]}
                """.formatted(MOBILE, sentAtSeconds, text);
    }

    private ResultActions deliver(String body, String signatureHeader) throws Exception {
        var request = post(Routes.Webhooks.WHATSAPP).contentType(MediaType.APPLICATION_JSON).content(body);
        return mvc.perform(signatureHeader == null ? request : request.header("X-Hub-Signature-256", signatureHeader));
    }

    private ResultActions signed(String body) throws Exception {
        return deliver(body, signature.sign(body.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("the subscribe handshake echoes the challenge only for the configured token")
    void handshake() throws Exception {
        mvc.perform(get(Routes.Webhooks.WHATSAPP).param("hub.mode", "subscribe")
                        .param("hub.verify_token", "test-verify-token-0123").param("hub.challenge", "1158201444"))
                .andExpect(status().isOk()).andExpect(content().string("1158201444"));
        mvc.perform(get(Routes.Webhooks.WHATSAPP).param("hub.mode", "subscribe")
                        .param("hub.verify_token", "guess").param("hub.challenge", "1158201444"))
                .andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("a STOP without Meta's signature, or with a forged one, changes nothing")
    void anUnsignedStopIsIgnored() throws Exception {
        deliver(reply("STOP", 1_800_000_000L), null).andExpect(status().isOk());
        deliver(reply("STOP", 1_800_000_000L), "sha256=" + "0".repeat(64)).andExpect(status().isOk());

        assertThat(optOuts.isOptedOut(MOBILE)).isFalse();
        verify(calls, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("a signed STOP opts the number out, and only a newer START brings it back")
    void stopThenStartInTheOrderSent() throws Exception {
        signed(reply("Stop", 1_800_000_000L)).andExpect(status().isOk());
        assertThat(optOuts.isOptedOut(MOBILE)).isTrue();

        signed(reply("START", 1_799_999_999L)).andExpect(status().isOk());
        assertThat(optOuts.isOptedOut(MOBILE)).as("a START sent before the STOP arrived late").isTrue();

        signed(reply("start", 1_800_000_100L)).andExpect(status().isOk());
        assertThat(optOuts.isOptedOut(MOBILE)).isFalse();
    }

    @Test
    @DisplayName("a sentence that merely contains stop is not an opt-out")
    void onlyAWholeKeywordCounts() throws Exception {
        signed(reply("please don't stop the visit", 1_800_000_000L)).andExpect(status().isOk());

        assertThat(optOuts.isOptedOut(MOBILE)).isFalse();
        assertThat(WhatsAppWebhookController.optChoice(" stop! ")).isTrue();
        assertThat(WhatsAppWebhookController.optChoice("Stop promotions")).isTrue();
    }

    @Test
    @DisplayName("a failed delivery reaches the provider ledger with Meta's error code")
    void aFailedDeliveryIsRecorded() throws Exception {
        signed("""
                {"entry":[{"changes":[{"value":{"statuses":[{"id":"wamid.y","status":"failed",
                 "timestamp":"1800000000","recipient_id":"91%s","errors":[{"code":131026}]}]}}]}]}
                """.formatted(MOBILE)).andExpect(status().isOk());

        verify(calls).record(eq(ProviderCalls.WHATSAPP), eq(WhatsAppWebhookController.DELIVERY),
                eq(ProviderCalls.Outcome.FAILED), eq(MOBILE), any(), eq("meta 131026"), any());
    }

    @Test
    @DisplayName("a half-configured or guessable webhook refuses to boot")
    void configurationGuards() {
        assertThatThrownBy(() -> new WhatsAppWebhookSignature("secret", "", false))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("or neither");
        assertThatThrownBy(() -> new WhatsAppWebhookSignature("secret", "short", false))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("at least 16");
        assertThat(new WhatsAppWebhookSignature("", "", true).configured()).isFalse();
    }
}
