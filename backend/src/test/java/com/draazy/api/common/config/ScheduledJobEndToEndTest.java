package com.draazy.api.common.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.common.web.RequestCorrelation;
import java.util.function.BooleanSupplier;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.test.annotation.DirtiesContext;

@SpringBootTest
@Import(ScheduledJobEndToEndTest.Config.class)
@DirtiesContext
@DisplayName("A real @Scheduled bean, scheduled by Spring, is traced and locked")
class ScheduledJobEndToEndTest {

    static final String JOB = "ProbeJob.tick";

    static class ProbeJob {
        final AtomicInteger runs = new AtomicInteger();
        final List<String> traces = new CopyOnWriteArrayList<>();
        final List<Boolean> lockHeldDuringRun = new CopyOnWriteArrayList<>();
        private final JobLock lock;

        ProbeJob(DataSource dataSource) {
            this.lock = new JobLock(dataSource);
        }

        @Scheduled(cron = "* * * * * *")
        public void tick() {
            traces.add(String.valueOf(MDC.get(RequestCorrelation.TRACE_ID_MDC)));
            var other = lock.tryAcquire(JOB);
            lockHeldDuringRun.add(other.isEmpty());
            other.ifPresent(JobLock.Held::close);
            runs.incrementAndGet();
        }
    }

    @TestConfiguration
    static class Config {
        @Bean
        ProbeJob probeJob(DataSource dataSource) {
            return new ProbeJob(dataSource);
        }
    }

    @Autowired
    ProbeJob probe;

    @Autowired
    DataSource dataSource;

    @Test
    @DisplayName("each run carries a job- trace id and holds the advisory lock; a held lock skips the run")
    void tracedLockedAndSkipped() throws Exception {
        awaitTrue(() -> probe.runs.get() >= 2);
        assertThat(probe.traces).allMatch(trace -> trace.matches("job-ProbeJob\\.tick-[0-9a-f]{8}"));
        assertThat(probe.lockHeldDuringRun).allMatch(held -> held);
        assertThat(MDC.get(RequestCorrelation.TRACE_ID_MDC)).isNull();

        try (var held = new JobLock(dataSource).tryAcquire(JOB).orElseThrow()) {
            Thread.sleep(300);
            int whileHeld = probe.runs.get();
            Thread.sleep(2_100);
            assertThat(probe.runs.get()).isEqualTo(whileHeld);
        }

        int released = probe.runs.get();
        awaitTrue(() -> probe.runs.get() > released);
    }

    private static void awaitTrue(BooleanSupplier condition) throws InterruptedException {
        long deadline = System.nanoTime() + 15_000_000_000L;
        while (!condition.getAsBoolean()) {
            assertThat(System.nanoTime()).as("condition not met in time").isLessThan(deadline);
            Thread.sleep(50);
        }
    }
}