package com.draazy.api.provider.zeptomail;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.draazy.api.common.web.Routes;
import com.draazy.api.provider.ProviderCalls;
import com.draazy.api.support.AbstractApiTest;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.ResultActions;

@TestPropertySource(properties = "draazy.providers.zeptomail.webhook-key=test-zepto-key")
@DisplayName("ZeptoMail webhook — signed bounces reach the provider ledger")
class ZeptoMailWebhookTest extends AbstractApiTest {

    private static final String BOUNCE = """
            {"event_name":["hardbounce"],"event_message":[{"email_info":{"subject":"Your receipt",
             "to":[{"email_address":{"address":"gone@example.com"}}]},
             "event_data":[{"details":[{"reason":"Invalid recipient","bounced_recipient":"gone@example.com"}],
             "object":"hardbounce"}],"request_id":"r1"}],"webhook_request_id":"w1"}""";

    @Autowired
    ZeptoMailWebhookSignature signature;

    @Autowired
    Clock clock;

    @MockitoSpyBean
    ProviderCalls calls;

    private ResultActions deliver(String event, String header) throws Exception {
        var request = post(Routes.Webhooks.ZEPTOMAIL).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .content("data=" + URLEncoder.encode(event, StandardCharsets.UTF_8));
        return mvc.perform(header == null ? request : request.header("producer-signature", header));
    }

    @Test
    @DisplayName("a signed hard bounce is recorded against the bounced address with Zoho's reason")
    void aSignedBounceIsRecorded() throws Exception {
        deliver(BOUNCE, signature.sign(BOUNCE, clock.millis())).andExpect(status().isOk());

        verify(calls).record(eq(ProviderCalls.ZEPTOMAIL), eq(ZeptoMailWebhookController.DELIVERY),
                eq(ProviderCalls.Outcome.FAILED), eq("gone@example.com"), eq("Your receipt"),
                eq("hardbounce Invalid recipient"), any());
    }

    @Test
    @DisplayName("an unsigned, forged or replayed bounce records nothing")
    void anUntrustedBounceIsIgnored() throws Exception {
        deliver(BOUNCE, null).andExpect(status().isOk());
        deliver(BOUNCE, signature.sign(BOUNCE.replace("gone@", "other@"), clock.millis())).andExpect(status().isOk());
        deliver(BOUNCE, signature.sign(BOUNCE, clock.millis() - 3_600_000L)).andExpect(status().isOk());

        verify(calls, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("an open is not a delivery failure")
    void anOpenIsIgnored() throws Exception {
        String open = "{\"event_name\":[\"email_open\"],\"event_message\":[{\"email_info\":{\"subject\":\"s\"}}]}";
        deliver(open, signature.sign(open, clock.millis())).andExpect(status().isOk());

        verify(calls, never()).record(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    @DisplayName("the signed value is the decoded form parameter, or a raw JSON body as sent")
    void payloadIsTheDecodedEvent() {
        assertThat(ZeptoMailWebhookSignature.payload("data=%7B%22a%22%3A%22x+y%22%7D".getBytes(StandardCharsets.UTF_8)))
                .isEqualTo("{\"a\":\"x y\"}");
        assertThat(ZeptoMailWebhookSignature.payload("{\"a\":1}".getBytes(StandardCharsets.UTF_8))).isEqualTo("{\"a\":1}");
        assertThat(new ZeptoMailWebhookSignature("", false, clock).configured()).isFalse();
    }
}
