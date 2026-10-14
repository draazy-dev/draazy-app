package com.draazy.api.common.config;

import com.draazy.api.common.web.RequestCorrelation;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.Trigger;
import org.springframework.scheduling.support.ScheduledMethodRunnable;
import org.springframework.util.ClassUtils;
import org.springframework.util.ReflectionUtils;

/** Wraps each {@code @Scheduled} run: a {@code job-<Class.method>-<hex>} trace id and, for cron and one-off runs
 * with a lock, one runner across instances. */
final class JobRunScheduler implements TaskScheduler {

    static final String TRACE_PREFIX = "job-";

    private static final Pattern QUALIFIED_METHOD = Pattern.compile("[\\w$]+(?:\\.[\\w$]+)+");

    private static final Logger log = LoggerFactory.getLogger(JobRunScheduler.class);

    private final TaskScheduler delegate;
    private final JobLock lock;

    JobRunScheduler(TaskScheduler delegate, JobLock lock) {
        this.delegate = delegate;
        this.lock = lock;
    }

    @Override
    public Clock getClock() {
        return delegate.getClock();
    }

    @Override
    public ScheduledFuture<?> schedule(Runnable task, Trigger trigger) {
        return delegate.schedule(wrap(task, true), trigger);
    }

    @Override
    public ScheduledFuture<?> schedule(Runnable task, Instant startTime) {
        return delegate.schedule(wrap(task, true), startTime);
    }

    // Fixed-rate and fixed-delay tasks tick on each instance's own clock and do per-instance housekeeping (such
    // as an in-memory purge every 25 s), so they get a trace id but no cluster lock or connection.
    @Override
    public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Instant startTime, Duration period) {
        return delegate.scheduleAtFixedRate(wrap(task, false), startTime, period);
    }

    @Override
    public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Duration period) {
        return delegate.scheduleAtFixedRate(wrap(task, false), period);
    }

    @Override
    public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Instant startTime, Duration delay) {
        return delegate.scheduleWithFixedDelay(wrap(task, false), startTime, delay);
    }

    @Override
    public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Duration delay) {
        return delegate.scheduleWithFixedDelay(wrap(task, false), delay);
    }

    private Runnable wrap(Runnable task, boolean clusterWide) {
        String job = jobName(task);
        JobLock runLock = clusterWide ? lock : null;
        return job == null ? task : () -> run(job, task, runLock);
    }

    // Spring hands the scheduler a tracking wrapper whose toString() is the scheduled method's
    // "<class>.<method>"; it is accepted only when that names a real no-arg method, so other tasks pass through.
    static String jobName(Runnable task) {
        if (task instanceof ScheduledMethodRunnable method) {
            return simpleName(ClassUtils.getUserClass(method.getTarget()), method.getMethod().getName());
        }
        String text = String.valueOf(task);
        int dot = text.lastIndexOf('.');
        if (dot <= 0 || !QUALIFIED_METHOD.matcher(text).matches()) {
            return null;
        }
        String method = text.substring(dot + 1);
        try {
            Class<?> type = ClassUtils.forName(text.substring(0, dot), ClassUtils.getDefaultClassLoader());
            return ReflectionUtils.findMethod(type, method) == null ? null : simpleName(type, method);
        } catch (ClassNotFoundException | LinkageError notAClass) {
            return null;
        }
    }

    private static String simpleName(Class<?> type, String method) {
        return type.getSimpleName() + "." + method;
    }

    private static void run(String job, Runnable task, JobLock lock) {
        MDC.put(RequestCorrelation.TRACE_ID_MDC,
                TRACE_PREFIX + job + "-" + UUID.randomUUID().toString().substring(0, 8));
        try {
            if (lock == null) {
                runLogged(job, task);
                return;
            }
            var held = lock.tryAcquire(job);
            if (held.isEmpty()) {
                log.debug("Skipping {}: another instance is running it", job);
                return;
            }
            try (var ignored = held.get()) {
                runLogged(job, task);
            }
        } finally {
            MDC.remove(RequestCorrelation.TRACE_ID_MDC);
        }
    }

    // Logged here, not left to Spring's error handler, so the failure still carries the job trace id.
    private static void runLogged(String job, Runnable task) {
        try {
            task.run();
        } catch (RuntimeException e) {
            log.error("Scheduled job {} failed", job, e);
        }
    }
}
