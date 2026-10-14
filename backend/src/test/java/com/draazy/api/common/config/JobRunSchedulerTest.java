package com.draazy.api.common.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import com.draazy.api.common.web.RequestCorrelation;
import com.draazy.api.support.AbstractApiTest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.config.FixedDelayTask;
import org.springframework.scheduling.support.ScheduledMethodRunnable;

@DisplayName("JobRunScheduler — every scheduled run is traced and runs on one instance at a time")
class JobRunSchedulerTest extends AbstractApiTest {

    public static class Probe {
        final List<String> traces = new ArrayList<>();
        int runs;

        public void tick() {
            runs++;
            traces.add(MDC.get(RequestCorrelation.TRACE_ID_MDC));
        }

        public void explode() {
            throw new IllegalStateException("job broke");
        }
    }

    @Autowired
    DataSource dataSource;

    private static Runnable wrapped(JobRunScheduler scheduler, TaskScheduler delegate, Probe probe, String method)
            throws Exception {
        scheduler.schedule(new ScheduledMethodRunnable(probe, method), Instant.now());
        ArgumentCaptor<Runnable> captor = ArgumentCaptor.forClass(Runnable.class);
        verify(delegate).schedule(captor.capture(), any(Instant.class));
        return captor.getValue();
    }

    @Test
    @DisplayName("a run carries job-<Class.method>-<8 hex> in MDC and clears it afterwards")
    void aRunIsTraced() throws Exception {
        TaskScheduler delegate = mock(TaskScheduler.class);
        Probe probe = new Probe();
        Runnable run = wrapped(new JobRunScheduler(delegate, null), delegate, probe, "tick");

        run.run();

        assertThat(probe.traces).singleElement().asString().matches("job-Probe\\.tick-[0-9a-f]{8}");
        assertThat(MDC.get(RequestCorrelation.TRACE_ID_MDC)).isNull();
    }

    @Test
    @DisplayName("a failing job is contained and still clears its trace id")
    void aFailureIsContained() throws Exception {
        TaskScheduler delegate = mock(TaskScheduler.class);
        Runnable run = wrapped(new JobRunScheduler(delegate, null), delegate, new Probe(), "explode");

        run.run();

        assertThat(MDC.get(RequestCorrelation.TRACE_ID_MDC)).isNull();
    }

    @Test
    @DisplayName("a run is skipped while another session holds the lock, and goes ahead once it is released")
    void theLockKeepsOneRunner() throws Exception {
        TaskScheduler delegate = mock(TaskScheduler.class);
        JobLock lock = new JobLock(dataSource);
        Probe probe = new Probe();
        Runnable run = wrapped(new JobRunScheduler(delegate, lock), delegate, probe, "tick");

        try (var other = lock.tryAcquire("Probe.tick").orElseThrow()) {
            run.run();
            assertThat(probe.runs).isZero();
        }

        run.run();
        assertThat(probe.runs).isEqualTo(1);
    }

    @Test
    @DisplayName("the tracking wrapper Spring registers around a @Scheduled method is recognised")
    void springsOutcomeTrackingWrapperIsRecognised() throws Exception {
        TaskScheduler delegate = mock(TaskScheduler.class);
        Probe probe = new Probe();
        Runnable spring = new FixedDelayTask(new ScheduledMethodRunnable(probe, "tick"), Duration.ofSeconds(1),
                Duration.ZERO).getRunnable();
        assertThat(spring).isNotInstanceOf(ScheduledMethodRunnable.class);

        new JobRunScheduler(delegate, null).schedule(spring, Instant.now());
        ArgumentCaptor<Runnable> captor = ArgumentCaptor.forClass(Runnable.class);
        verify(delegate).schedule(captor.capture(), any(Instant.class));
        captor.getValue().run();

        assertThat(probe.traces).singleElement().asString().matches("job-Probe\\.tick-[0-9a-f]{8}");
    }

    @Test
    @DisplayName("a programmatic task that merely looks like a name is not traced or locked")
    void lookalikesAreNotWrapped() {
        TaskScheduler delegate = mock(TaskScheduler.class);
        Runnable lambda = () -> { };
        Runnable named = new Runnable() {
            @Override
            public void run() { }

            @Override
            public String toString() {
                return "com.example.NoSuchClass.method";
            }
        };

        assertThat(JobRunScheduler.jobName(new FixedDelayTask(lambda, Duration.ofSeconds(1), Duration.ZERO)
                .getRunnable())).isNull();
        assertThat(JobRunScheduler.jobName(named)).isNull();
        assertThat(JobRunScheduler.jobName(new FixedDelayTask(named, Duration.ofSeconds(1), Duration.ZERO)
                .getRunnable())).isNull();
    }
    @Test
    @DisplayName("tasks that are not @Scheduled methods pass through untouched")
    void otherTasksAreNotWrapped() {
        TaskScheduler delegate = mock(TaskScheduler.class);
        Runnable plain = () -> { };

        new JobRunScheduler(delegate, null).schedule(plain, Instant.now());

        verify(delegate).schedule(eq(plain), any(Instant.class));
    }

    @Test
    @DisplayName("a fixed-delay task is per-instance housekeeping: traced, but runs even while the lock is held")
    void fixedDelayTasksAreNotLocked() throws Exception {
        TaskScheduler delegate = mock(TaskScheduler.class);
        JobLock lock = new JobLock(dataSource);
        Probe probe = new Probe();
        new JobRunScheduler(delegate, lock).scheduleWithFixedDelay(new ScheduledMethodRunnable(probe, "tick"),
                Duration.ofSeconds(25));
        ArgumentCaptor<Runnable> captor = ArgumentCaptor.forClass(Runnable.class);
        verify(delegate).scheduleWithFixedDelay(captor.capture(), any(Duration.class));

        try (var other = lock.tryAcquire("Probe.tick").orElseThrow()) {
            captor.getValue().run();
        }

        assertThat(probe.traces).singleElement().asString().matches("job-Probe\\.tick-[0-9a-f]{8}");
    }
}