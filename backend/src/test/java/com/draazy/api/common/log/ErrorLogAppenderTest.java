package com.draazy.api.common.log;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import com.draazy.api.common.web.RequestCorrelation;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

@DisplayName("ErrorLogAppender — ERROR events become deduplicated, scrubbed rows")
class ErrorLogAppenderTest {

    private LoggerContext context;
    private Logger logger;
    private ErrorEventStore store;
    private ErrorLogAppender appender;

    @BeforeEach
    void wire() {
        context = new LoggerContext();
        context.setMDCAdapter(((LoggerContext) LoggerFactory.getILoggerFactory()).getMDCAdapter());
        logger = context.getLogger("com.draazy.api.example.Thing");
        logger.setLevel(Level.DEBUG);
        store = mock(ErrorEventStore.class);
        appender = new ErrorLogAppender(store);
        appender.setContext(context);
        appender.startWorker();
        appender.start();
        logger.addAppender(appender);
    }

    @AfterEach
    void unwire() {
        appender.stop();
        MDC.clear();
        context.stop();
    }

    private ErrorEventStore.Capture captured() {
        ArgumentCaptor<ErrorEventStore.Capture> captor = ArgumentCaptor.forClass(ErrorEventStore.Capture.class);
        verify(store, timeout(2000)).record(captor.capture());
        return captor.getValue();
    }

    @Test
    void anErrorIsCapturedWithItsTraceRequestAndUser() {
        UUID user = UUID.randomUUID();
        MDC.put(RequestCorrelation.TRACE_ID_MDC, "trace-abc");
        MDC.put(RequestCorrelation.METHOD_MDC, "POST");
        MDC.put(RequestCorrelation.PATH_MDC, "/api/things/42");
        MDC.put(RequestCorrelation.USER_ID_MDC, user.toString());
        MDC.put(RequestCorrelation.USER_ROLE_MDC, "owner");

        logger.error("Unhandled failure for {}", "asha@example.com", new IllegalStateException("boom 77"));

        ErrorEventStore.Capture c = captured();
        assertThat(c.source()).isEqualTo("api");
        assertThat(c.traceId()).isEqualTo("trace-abc");
        assertThat(c.httpMethod()).isEqualTo("POST");
        assertThat(c.path()).isEqualTo("/api/things/42");
        assertThat(c.userId()).isEqualTo(user);
        assertThat(c.userRole()).isEqualTo("owner");
        assertThat(c.errorType()).isEqualTo("java.lang.IllegalStateException");
        assertThat(c.message()).contains("[email]").doesNotContain("asha@example.com");
        assertThat(c.stack()).contains("IllegalStateException: boom").contains("ErrorLogAppenderTest");
        assertThat(c.fingerprint()).hasSize(64);
    }

    @Test
    void aJobTraceIdMakesItAJobError() {
        MDC.put(RequestCorrelation.TRACE_ID_MDC, "job-SomeSweep.run-1a2b3c4d");

        logger.error("Sweep failed");

        assertThat(captured().source()).isEqualTo("job");
    }

    @Test
    void lowerLevelsAreIgnored() {
        logger.warn("just a warning");
        logger.error("then an error");

        assertThat(captured().message()).isEqualTo("then an error");
    }

    @Test
    void sameFaultWithDifferentIdsSharesAFingerprint() {
        String first = ErrorLogAppender.capture(event("Row 12 missing for " + UUID.randomUUID())).fingerprint();
        String second = ErrorLogAppender.capture(event("Row 99 missing for " + UUID.randomUUID())).fingerprint();
        String other = ErrorLogAppender.capture(event("Something else entirely")).fingerprint();

        assertThat(first).isEqualTo(second).isNotEqualTo(other);
    }

    @Test
    void stackIsTrimmed() {
        Throwable deep = new RuntimeException("deep");
        StackTraceElement[] frames = new StackTraceElement[200];
        for (int i = 0; i < frames.length; i++) {
            frames[i] = new StackTraceElement("com.draazy.api.Deep", "m" + i, "Deep.java", i);
        }
        deep.setStackTrace(frames);

        logger.error("deep failure", deep);

        long lines = captured().stack().lines().filter(l -> l.startsWith("\tat ")).count();
        assertThat(lines).isEqualTo(40);
    }

    @Test
    void aFailingStoreDoesNotLoopOrBlockTheCaller() {
        doThrow(new IllegalStateException("db down")).when(store).record(any());

        logger.error("first");
        logger.error("second");

        verify(store, timeout(2000).atLeastOnce()).record(any());
        assertThat(appender.dropped()).isLessThanOrEqualTo(2);
    }

    @Test
    void eventsFromTheCaptureCodeItselfAreIgnored() {
        Logger own = context.getLogger(ErrorEventStore.class.getName());
        own.addAppender(appender);

        own.error("store failed");
        logger.error("real error");

        assertThat(captured().message()).isEqualTo("real error");
    }

    private ch.qos.logback.classic.spi.ILoggingEvent event(String message) {
        return new ch.qos.logback.classic.spi.LoggingEvent(Logger.class.getName(), logger, Level.ERROR,
                message, null, null);
    }
}