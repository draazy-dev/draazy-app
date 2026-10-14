package com.draazy.api.common.log;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

@DisplayName("LogScrubber — nothing personal or secret reaches error_event")
class LogScrubberTest {

    @Test
    void nullAndEmptyPassThrough() {
        assertThat(LogScrubber.scrub(null)).isNull();
        assertThat(LogScrubber.scrub("")).isEmpty();
        assertThat(LogScrubber.scrub(null, 10)).isNull();
    }

    @Test
    void emailsBecomeAPlaceholder() {
        assertThat(LogScrubber.scrub("Mail to asha.k+test@example.co.in failed"))
                .isEqualTo("Mail to [email] failed");
    }

    @ParameterizedTest
    @CsvSource(delimiter = '|', value = {
            "call 9876543210 now|call [number] now",
            "call +91 98765 43210 now|call [number] now",
            "call +91-9876543210 now|call [number] now",
            "call 098765-43210 now|call [number] now",
            "ref 12345678901234 done|ref [number] done"})
    void phoneNumbersAndLongDigitRunsAreRemoved(String input, String expected) {
        assertThat(LogScrubber.scrub(input)).isEqualTo(expected);
    }

    @Test
    void shortNumbersSurvive() {
        assertThat(LogScrubber.scrub("status 500 after 2048 ms, row 123456")).isEqualTo("status 500 after 2048 ms, row 123456");
    }

    @Test
    void aadhaarWithSpacesIsRemoved() {
        assertThat(LogScrubber.scrub("id 2345 6789 0123 given")).isEqualTo("id [aadhaar] given");
    }

    @Test
    void panIsRemoved() {
        assertThat(LogScrubber.scrub("PAN ABCDE1234F supplied")).isEqualTo("PAN [pan] supplied");
    }

    @Test
    void jwtAndBearerTokensAreRemoved() {
        String jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2lnbmF0dXJlLXZhbHVl";
        assertThat(LogScrubber.scrub("token was " + jwt + " ok")).isEqualTo("token was [token] ok");
        assertThat(LogScrubber.scrub("Authorization: Bearer abc.def-123_x/y=")).doesNotContain("abc.def");
        assertThat(LogScrubber.scrub("sent Bearer abc123xyz to api")).isEqualTo("sent [token] to api");
    }

    @Test
    void longBase64AndHexRunsAreRemoved() {
        assertThat(LogScrubber.scrub("key 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 end"))
                .isEqualTo("key [token] end");
        assertThat(LogScrubber.scrub("blob QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo0MTIzNDU2Nzg5MA== end"))
                .isEqualTo("blob [token] end");
    }

    @Test
    void longIdentifiersWithoutDigitsSurvive() {
        String name = "com.draazy.api.leads.contact.ContactGateServiceImplementation";
        assertThat(LogScrubber.scrub(name)).isEqualTo(name);
    }

    @Test
    void secretKeyValuesKeepTheKeyOnly() {
        assertThat(LogScrubber.scrub("login password=hunter2&x=1")).isEqualTo("login password=[token]&x=1");
        assertThat(LogScrubber.scrub("secret: s3cr3t value")).isEqualTo("secret: [token] value");
        assertThat(LogScrubber.scrub("Token=abc")).isEqualTo("Token=[token]");
    }

    @Test
    void queryStringsAndFragmentsAreStripped() {
        assertThat(LogScrubber.scrub("GET https://draazy.in/search?city=pune&phone=1 failed"))
                .isEqualTo("GET https://draazy.in/search failed");
        assertThat(LogScrubber.scrub("at /listings/abc#section-2 here")).isEqualTo("at /listings/abc here");
    }

    @Test
    void sqlPlaceholdersAreNotMistakenForQueryStrings() {
        assertThat(LogScrubber.scrub("insert into t values (?, ?) where id = ?\nnext"))
                .isEqualTo("insert into t values (?, ?) where id = ?\nnext");
    }

    @Test
    void uuidsPassThroughIntact() {
        String id = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
        assertThat(LogScrubber.scrub("user " + id + " mail a@b.com")).isEqualTo("user " + id + " mail [email]");
    }

    @Test
    void truncatesAfterScrubbing() {
        assertThat(LogScrubber.scrub("a@b.com and more text", 7)).isEqualTo("[email]");
    }

    @Test
    void queryStringAfterAUuidIsStillStrippedAndSecretUuidsAreRemoved() {
        String id = "123e4567-e89b-12d3-a456-426614174000";
        assertThat(LogScrubber.scrub("GET /docs/" + id + "?share=abc123secret&code=998877"))
                .isEqualTo("GET /docs/" + id);
        assertThat(LogScrubber.scrub("refresh_token=" + id + " used")).isEqualTo("refresh_token=[token] used");
        assertThat(LogScrubber.scrub("access_token: abc otp=123456")).isEqualTo("access_token: [token] otp=[token]");
    }

    @Test
    void postgresRowAndKeyValuesAreRemoved() {
        assertThat(LogScrubber.scrub("Detail: Failing row contains (3f2504e0-4f89-41d3-9a0c-0305e82c3301, Asha, Baner)."))
                .isEqualTo("Detail: Failing row contains ([row])");
        assertThat(LogScrubber.scrub("Detail: Key (email, city)=(Asha Kulkarni, Pune) already exists."))
                .isEqualTo("Detail: Key (email, city)=([value])");
    }

    @Test
    void postgresValuesSpanningLinesOrNestedParenthesesAreRemoved() {
        assertThat(LogScrubber.scrub("Failing row contains (1, Flat 4\nBaner Road, Asha)."))
                .isEqualTo("Failing row contains ([row])");
        assertThat(LogScrubber.scrub("Key (lower(name::text))=(asha kulkarni) already exists."))
                .isEqualTo("Key (lower(name::text))=([value])");
    }

    @Test
    void jsonQuotedSecretsAreRemoved() {
        assertThat(LogScrubber.scrub("{\"otp\":\"123456\",\"password\": \"hunter2\"}"))
                .isEqualTo("{\"otp\":\"[token]\",\"password\": \"[token]\"}");
    }

    @Test
    void hostileInputScrubsInLinearTime() {
        String hostile = "a".repeat(100_000) + "-eyJ".repeat(25_000);
        long started = System.nanoTime();
        LogScrubber.scrub(hostile);
        assertThat((System.nanoTime() - started) / 1_000_000).isLessThan(2_000);
    }
}