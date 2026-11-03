package com.draazy.api.common.web;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import jakarta.servlet.FilterChain;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.slf4j.LoggerFactory;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class CorrelationIdFilterTest {

    private final CorrelationIdFilter filter = new CorrelationIdFilter();

    private final ListAppender<ILoggingEvent> securityEvents = captureSecurityLog();

    @AfterEach
    void detachCapture() {
        securityLogger().detachAndStopAllAppenders();
    }

    @ParameterizedTest
    @CsvSource({"401, INFO", "403, WARN", "429, WARN"})
    void refusalsAreRecordedAsSecurityEvents(int status, String level) throws Exception {
        var request = new MockHttpServletRequest("POST", "/api/auth/login");
        request.setQueryString("token=secret-in-query");

        filter.doFilter(request, new MockHttpServletResponse(), (req, res) ->
                ((MockHttpServletResponse) res).setStatus(status));

        assertThat(securityEvents.list).singleElement().satisfies(e -> {
            assertThat(e.getLevel()).isEqualTo(Level.toLevel(level));
            assertThat(e.getFormattedMessage())
                    .contains("status=" + status, "POST", "/api/auth/login")
                    .doesNotContain("secret-in-query");
        });
    }

    @ParameterizedTest
    @ValueSource(ints = {200, 400, 404, 500})
    void otherOutcomesAreNotSecurityEvents(int status) throws Exception {
        filter.doFilter(new MockHttpServletRequest("GET", "/api/properties"),
                new MockHttpServletResponse(), (req, res) -> ((MockHttpServletResponse) res).setStatus(status));

        assertThat(securityEvents.list).isEmpty();
    }

    private static ListAppender<ILoggingEvent> captureSecurityLog() {
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        securityLogger().addAppender(appender);
        return appender;
    }

    private static Logger securityLogger() {
        return (Logger) LoggerFactory.getLogger(CorrelationIdFilter.SECURITY_LOGGER);
    }

    @Test
    void echoesSafeInboundTraceId() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader(RequestCorrelation.TRACE_ID_HEADER, "trace-123_ABC");
        var response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> {};

        filter.doFilter(request, response, chain);

        assertThat(response.getHeader(RequestCorrelation.TRACE_ID_HEADER)).isEqualTo("trace-123_ABC");
    }

    @Test
    void replacesUnsafeTraceIdToBlockResponseSplitting() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader(RequestCorrelation.TRACE_ID_HEADER, "evil\r\nSet-Cookie: pwn=1");
        var response = new MockHttpServletResponse();
        FilterChain chain = (req, res) -> {};

        filter.doFilter(request, response, chain);

        String echoed = response.getHeader(RequestCorrelation.TRACE_ID_HEADER);
        assertThat(echoed).doesNotContain("\r").doesNotContain("\n").doesNotContain("Set-Cookie");
        assertThat(echoed).matches("^[A-Za-z0-9-]{36}$");
    }

    @Test
    void replacesAnInboundJobTraceIdSoRequestErrorsAreNotFiledAsJobs() throws Exception {
        var request = new MockHttpServletRequest();
        request.addHeader(RequestCorrelation.TRACE_ID_HEADER, "job-forged_1a2b3c4d");
        var response = new MockHttpServletResponse();

        filter.doFilter(request, response, (req, res) -> {});

        assertThat(response.getHeader(RequestCorrelation.TRACE_ID_HEADER)).doesNotStartWith("job-");
    }
}
