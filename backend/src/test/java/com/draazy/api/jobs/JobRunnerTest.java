package com.draazy.api.jobs;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.jobs.ScheduledJob.Group;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class JobRunnerTest {

    private final List<String> ran = new ArrayList<>();

    private ScheduledJob job(String name, Group group) {
        return new ScheduledJob(name, group, () -> {
            ran.add(name);
            return 1;
        });
    }

    @Test
    void aFailingJobDoesNotStopTheRestOfItsGroup() {
        ScheduledJob boom = new ScheduledJob("boom", Group.NIGHTLY, () -> {
            ran.add("boom");
            throw new IllegalStateException("database down");
        });
        JobRunner runner = new JobRunner(List.of(job("first", Group.NIGHTLY), boom, job("last", Group.NIGHTLY)),
                new MockEnvironment());

        runner.run(Group.NIGHTLY);

        assertThat(ran).containsExactly("first", "boom", "last");
    }

    @Test
    void anErrorThatIsNotFatalAlsoLeavesTheRestRunning() {
        ScheduledJob broken = new ScheduledJob("broken", Group.DAYTIME, () -> {
            throw new NoClassDefFoundError("missing");
        });
        JobRunner runner = new JobRunner(List.of(broken, job("after", Group.DAYTIME)), new MockEnvironment());

        runner.run(Group.DAYTIME);

        assertThat(ran).containsExactly("after");
    }

    @Test
    void drainRepeatsUntilAnEmptyPageAndStopsAtTheCap() {
        Deque<Long> pages = new ArrayDeque<>(List.of(200L, 200L, 13L, 0L, 99L));
        assertThat(JobCatalog.drain(pages::pop).getAsLong()).isEqualTo(413);

        assertThat(JobCatalog.drain(() -> 200).getAsLong()).isEqualTo(2000);
    }

    @Test
    void aDisabledJobIsSkipped() {
        MockEnvironment env = new MockEnvironment().withProperty("draazy.jobs.off.enabled", "false");
        JobRunner runner = new JobRunner(List.of(job("off", Group.DAYTIME), job("on", Group.DAYTIME)), env);

        runner.run(Group.DAYTIME);

        assertThat(ran).containsExactly("on");
    }

    @Test
    void onlyTheRequestedGroupRuns() {
        JobRunner runner = new JobRunner(List.of(job("frequent", Group.FREQUENT), job("hourly", Group.HOURLY)),
                new MockEnvironment());

        runner.run(Group.HOURLY);
        runner.run(Group.NIGHTLY);

        assertThat(ran).containsExactly("hourly");
    }
}
