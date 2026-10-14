package com.draazy.api.common.log;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.IThrowableProxy;
import ch.qos.logback.classic.spi.StackTraceElementProxy;
import ch.qos.logback.core.AppenderBase;
import com.draazy.api.common.error.GlobalExceptionHandler;
import com.draazy.api.common.web.RequestCorrelation;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.ILoggerFactory;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/** Captures ERROR events into {@code error_event} via a bounded queue and one daemon writer, so a failing database
 * costs a dropped row, never a blocked request or a loop. */
@Component
@ConditionalOnProperty(name = "draazy.error-log.enabled", havingValue = "true", matchIfMissing = true)
public class ErrorLogAppender extends AppenderBase<ILoggingEvent> {

    private static final String OWN_PACKAGE = ErrorLogAppender.class.getPackageName();
    private static final String JOB_TRACE_PREFIX = "job-";
    private static final String APP_PACKAGE = "com.draazy";
    private static final int QUEUE_CAPACITY = 500;
    private static final int MAX_FRAMES = 40;
    private static final int MAX_CAUSES = 4;
    private static final int MAX_PATH = 500;
    private static final long BACKOFF_MS = 5_000;

    private final ErrorEventStore store;
    private final BlockingQueue<ErrorEventStore.Capture> queue = new ArrayBlockingQueue<>(QUEUE_CAPACITY);
    private final ThreadLocal<Boolean> capturing = new ThreadLocal<>();
    private final AtomicLong dropped = new AtomicLong();
    private volatile Thread worker;

    public ErrorLogAppender(ErrorEventStore store) {
        this.store = store;
        setName("draazy-error-log");
    }

    /** Events dropped because the queue was full. */
    public long dropped() {
        return dropped.get();
    }

    @PostConstruct
    void attach() {
        ILoggerFactory factory = LoggerFactory.getILoggerFactory();
        if (!(factory instanceof LoggerContext context)) {
            return;
        }
        setContext(context);
        startWorker();
        start();
        context.getLogger(Logger.ROOT_LOGGER_NAME).addAppender(this);
    }

    void startWorker() {
        worker = Thread.ofPlatform().daemon().name("error-log-writer").start(this::drain);
    }

    @PreDestroy
    void detach() {
        if (LoggerFactory.getILoggerFactory() instanceof LoggerContext context) {
            context.getLogger(Logger.ROOT_LOGGER_NAME).detachAppender(this);
        }
        stop();
        Thread writer = worker;
        if (writer != null) {
            writer.interrupt();
        }
    }

    @Override
    protected void append(ILoggingEvent event) {
        if (!event.getLevel().isGreaterOrEqual(Level.ERROR) || capturing.get() != null
                || Thread.currentThread() == worker || event.getLoggerName().startsWith(OWN_PACKAGE)) {
            return;
        }
        capturing.set(Boolean.TRUE);
        try {
            if (!queue.offer(capture(event))) {
                dropped.incrementAndGet();
            }
        } catch (RuntimeException ignored) {
            dropped.incrementAndGet();
        } finally {
            capturing.remove();
        }
    }

    private void drain() {
        while (!Thread.currentThread().isInterrupted()) {
            try {
                store.record(queue.take());
            } catch (InterruptedException e) {
                return;
            } catch (RuntimeException e) {
                dropped.incrementAndGet();
                try {
                    Thread.sleep(BACKOFF_MS);
                } catch (InterruptedException interrupted) {
                    return;
                }
            }
        }
    }

    static ErrorEventStore.Capture capture(ILoggingEvent event) {
        Map<String, String> mdc = event.getMDCPropertyMap();
        String traceId = mdc.get(RequestCorrelation.TRACE_ID_MDC);
        String source = traceId != null && traceId.startsWith(JOB_TRACE_PREFIX) ? "job" : "api";
        IThrowableProxy thrown = event.getThrowableProxy();
        String errorType = thrown == null ? null : thrown.getClassName();
        String detail = thrown == null ? null : thrown.getMessage();
        String message = event.getFormattedMessage() + (detail == null ? "" : ": " + detail);
        boolean handlerCatchAll = GlobalExceptionHandler.class.getName().equals(event.getLoggerName());
        String fingerprint = ErrorEventStore.fingerprint(source,
                errorType != null ? errorType : event.getLoggerName(), firstAppFrame(thrown),
                ErrorEventStore.normalise(detail != null ? detail : event.getFormattedMessage()));
        return new ErrorEventStore.Capture(fingerprint, source, errorType,
                LogScrubber.scrub(message, ErrorEventStore.MAX_MESSAGE),
                thrown == null ? null : stack(thrown),
                LogScrubber.scrub(mdc.get(RequestCorrelation.PATH_MDC), MAX_PATH),
                mdc.get(RequestCorrelation.METHOD_MDC), handlerCatchAll ? 500 : null, null,
                mdc.get(RequestCorrelation.USER_ROLE_MDC), userId(mdc.get(RequestCorrelation.USER_ID_MDC)),
                traceId, Map.of("logger", event.getLoggerName()));
    }

    private static String firstAppFrame(IThrowableProxy thrown) {
        if (thrown != null && thrown.getStackTraceElementProxyArray() != null) {
            for (StackTraceElementProxy frame : thrown.getStackTraceElementProxyArray()) {
                StackTraceElement element = frame.getStackTraceElement();
                if (element.getClassName().startsWith(APP_PACKAGE)) {
                    return element.getClassName() + "." + element.getMethodName();
                }
            }
        }
        return "";
    }

    private static String stack(IThrowableProxy thrown) {
        StringBuilder out = new StringBuilder();
        int frames = 0;
        IThrowableProxy current = thrown;
        for (int depth = 0; current != null && depth <= MAX_CAUSES; depth++, current = current.getCause()) {
            out.append(depth == 0 ? "" : "Caused by: ").append(current.getClassName());
            if (current.getMessage() != null) {
                out.append(": ").append(LogScrubber.scrub(current.getMessage(), 500));
            }
            out.append('\n');
            StackTraceElementProxy[] trace = current.getStackTraceElementProxyArray();
            for (int i = 0; trace != null && i < trace.length && frames < MAX_FRAMES; i++, frames++) {
                out.append("\tat ").append(trace[i].getStackTraceElement()).append('\n');
            }
        }
        return out.length() <= ErrorEventStore.MAX_STACK ? out.toString() : out.substring(0, ErrorEventStore.MAX_STACK);
    }

    private static UUID userId(String value) {
        try {
            return value == null ? null : UUID.fromString(value);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
