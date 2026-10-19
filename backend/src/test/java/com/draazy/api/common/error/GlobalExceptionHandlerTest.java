package com.draazy.api.common.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.mock.http.MockHttpInputMessage;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void typedExceptionMapsToEnvelopeWithItsStatusAndCode() {
        var response = handler.handleApi(new NotFoundException("Property not found"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        ApiError body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.error()).isEqualTo("not_found");
        assertThat(body.message()).isEqualTo("Property not found");
        assertThat(body.status()).isEqualTo(404);
    }

    @Test
    void rateLimitedAddsRetryAfterHeader() {
        var response = handler.handleApi(new RateLimitedException("Too many requests", 30));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS);
        assertThat(response.getHeaders().getFirst(HttpHeaders.RETRY_AFTER)).isEqualTo("30");
        assertThat(response.getBody().error()).isEqualTo("rate_limited");
    }

    @Test
    void uncaughtBecomesGeneric500NeverLeakingDetail() {
        var response = handler.handleUncaught(new RuntimeException("secret stacktrace detail"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().error()).isEqualTo("internal");
        assertThat(response.getBody().message()).doesNotContain("secret");
    }

    @Test
    void illegalArgumentFromOurOwnCodeStaysA500() {
        var response = handler.handleIllegalArgument(new IllegalArgumentException("internal invariant"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody().message()).doesNotContain("invariant");
    }

    /** The 409 is shared with constraint violations, so the message is what tells a lost race apart;
     * Hibernate's text names the entity and row id and must not reach the body. */
    @Test
    void lostConcurrentUpdateIs409AdvisingReloadAndLeaksNoEntityDetail() {
        var response = handler.handleOptimisticLock(new OptimisticLockingFailureException(
                "Row was updated or deleted by another transaction "
                        + "(com.draazy.api.services.ticket.Ticket#a1b2)"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody().error()).isEqualTo("conflict");
        assertThat(response.getBody().message()).contains("Reload");
        assertThat(response.getBody().message()).doesNotContain("Ticket");
        assertThat(response.getBody().message()).doesNotContain("a1b2");
    }

    /** Jackson's message names the target class, the JSON pointer and a payload fragment; a realistic
     * one is used because the assertion is that none of the three survives. */
    @Test
    void unreadableBodyIs400AndLeaksNoJacksonDetail() {
        var response = handler.handleUnreadableBody(new HttpMessageNotReadableException(
                "JSON parse error: Cannot deserialize value of type `com.draazy.api.catalog"
                        + ".listing.ListingCreate` from String \"abc\" at [Source: (String)"
                        + "\"{\"price\":\"abc\"}\"; line: 1, column: 11]",
                new MockHttpInputMessage(new byte[0])));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().error()).isEqualTo("bad_request");
        assertThat(response.getBody().message()).doesNotContain("com.draazy");
        assertThat(response.getBody().message()).doesNotContain("ListingCreate");
        assertThat(response.getBody().message()).doesNotContain("line: 1");
    }

    /** The parameter name is published contract; the Java type it failed to bind to is our signature. */
    @Test
    void badParameterIs400NamingTheParamButNotItsJavaType() {
        var missing = handler.handleBadParameter(
                new MissingServletRequestParameterException("propertyId", "String"));

        assertThat(missing.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(missing.getBody().error()).isEqualTo("bad_request");
        assertThat(missing.getBody().message()).contains("propertyId");

        var mismatch = handler.handleBadParameter(new MethodArgumentTypeMismatchException(
                "not-a-number", Integer.class, "page", null, new NumberFormatException()));

        assertThat(mismatch.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(mismatch.getBody().message()).contains("page");
        assertThat(mismatch.getBody().message()).doesNotContain("Integer");
    }

    /** 405 without an {@code Allow} header makes the client guess which verb to use instead. */
    @Test
    void wrongVerbIs405WithAnAllowHeader() {
        var response = handler.handleMethodNotSupported(
                new HttpRequestMethodNotSupportedException("DELETE", List.of("GET", "POST")));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.METHOD_NOT_ALLOWED);
        assertThat(response.getBody().error()).isEqualTo("method_not_allowed");
        assertThat(response.getHeaders().getAllow())
                .containsExactlyInAnyOrder(HttpMethod.GET, HttpMethod.POST);
    }

    /** Must render the same code as the vault's own byte-sniffing refusal, or one outcome has two names. */
    @Test
    void unsupportedContentTypeIs415WithTheSameCodeAsTheVaultsOwnRefusal() {
        var response = handler.handleMediaTypeNotSupported(
                new HttpMediaTypeNotSupportedException(MediaType.APPLICATION_JSON,
                        List.of(MediaType.MULTIPART_FORM_DATA)));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        assertThat(response.getBody().error())
                .isEqualTo(new UnsupportedMediaTypeException("x").getCode());
    }
}
