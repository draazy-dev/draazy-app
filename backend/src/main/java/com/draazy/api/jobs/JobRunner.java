package com.draazy.api.jobs;

import com.draazy.api.jobs.ScheduledJob.Group;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs every {@link ScheduledJob} in four IST cron groups, each in its own try so one failure never stops the
 * rest. JobRunScheduler's advisory lock keeps each group on one instance. */
@Component
@ConditionalOnProperty(name = "draazy.jobs.enabled", havingValue = "true", matchIfMissing = true)
public class JobRunner {

    private static final Logger log = LoggerFactory.getLogger(JobRunner.class);
    private static final String IST = "Asia/Kolkata";

    private final Map<Group, List<ScheduledJob>> jobs;
    private final Environment env;

    public JobRunner(List<ScheduledJob> jobs, Environment env) {
        this.jobs = jobs.stream().collect(Collectors.groupingBy(
                ScheduledJob::group, () -> new EnumMap<>(Group.class), Collectors.toList()));
        this.env = env;
    }

    @Scheduled(cron = "${draazy.jobs.frequent.cron}", zone = IST)
    public void frequent() {
        run(Group.FREQUENT);
    }

    @Scheduled(cron = "${draazy.jobs.hourly.cron}", zone = IST)
    public void hourly() {
        run(Group.HOURLY);
    }

    @Scheduled(cron = "${draazy.jobs.nightly.cron}", zone = IST)
    public void nightly() {
        run(Group.NIGHTLY);
    }

    @Scheduled(cron = "${draazy.jobs.daytime.cron}", zone = IST)
    public void daytime() {
        run(Group.DAYTIME);
    }

    void run(Group group) {
        for (ScheduledJob job : jobs.getOrDefault(group, List.of())) {
            if (!env.getProperty("draazy.jobs." + job.name() + ".enabled", Boolean.class, true)) {
                continue;
            }
            long started = System.nanoTime();
            try {
                long touched = job.task().getAsLong();
                if (touched > 0) {
                    log.info("Job {} touched {} row(s) in {} ms", job.name(), touched,
                            (System.nanoTime() - started) / 1_000_000);
                }
            } catch (VirtualMachineError fatal) {
                throw fatal;
            } catch (RuntimeException | Error e) {
                log.error("Job {} failed; the rest of the {} group carries on and it retries next tick",
                        job.name(), group, e);
            }
        }
    }
}
