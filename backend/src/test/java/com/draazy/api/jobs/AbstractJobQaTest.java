package com.draazy.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.draazy.api.jobs.ScheduledJob.Group;
import com.draazy.api.support.AbstractCommittedApiTest;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;

@TestPropertySource(properties = {
        "draazy.jobs.enabled=true",
        "draazy.jobs.frequent.cron=-",
        "draazy.jobs.hourly.cron=-",
        "draazy.jobs.nightly.cron=-",
        "draazy.jobs.daytime.cron=-",
})
abstract class AbstractJobQaTest extends AbstractCommittedApiTest {
    @Autowired
    private JobRunner runner;

    private final Logger runnerLog = (Logger) LoggerFactory.getLogger(JobRunner.class);
    private final ListAppender<ILoggingEvent> events = new ListAppender<>();
    private Level previousLevel;

    @BeforeEach
    void captureRunnerLog() {
        previousLevel = runnerLog.getLevel();
        runnerLog.setLevel(Level.INFO);
        events.start();
        runnerLog.addAppender(events);
    }

    @AfterEach
    void releaseRunnerLog() {
        runnerLog.detachAppender(events);
        runnerLog.setLevel(previousLevel);
    }

    protected void runGroup(Group group) {
        events.list.clear();
        runner.run(group);
        List<String> failures = events.list.stream()
                .filter(e -> e.getLevel() == Level.ERROR)
                .map(e -> e.getFormattedMessage() + " -> " + (e.getThrowableProxy() == null ? ""
                        : e.getThrowableProxy().getClassName() + ": " + e.getThrowableProxy().getMessage()))
                .toList();
        assertThat(failures).as("jobs that failed in %s", group).isEmpty();
    }

    protected long touched(String jobName) {
        return events.list.stream()
                .filter(e -> e.getLevel() == Level.INFO && e.getArgumentArray() != null
                        && e.getArgumentArray().length > 1 && jobName.equals(e.getArgumentArray()[0]))
                .mapToLong(e -> ((Number) e.getArgumentArray()[1]).longValue())
                .sum();
    }
}
