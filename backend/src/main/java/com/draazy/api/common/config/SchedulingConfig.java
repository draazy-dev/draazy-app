package com.draazy.api.common.config;

import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.SchedulingConfigurer;
import org.springframework.scheduling.config.ScheduledTaskRegistrar;

/** Every scheduled run goes through {@link JobRunScheduler}: a {@code job-...} trace id and an advisory lock, off with
 * {@code draazy.scheduling.job-lock.enabled=false}. */
@Configuration
@EnableScheduling
public class SchedulingConfig implements SchedulingConfigurer {

    private final ObjectProvider<TaskScheduler> scheduler;
    private final ObjectProvider<DataSource> dataSource;
    private final boolean lockEnabled;

    public SchedulingConfig(ObjectProvider<TaskScheduler> scheduler, ObjectProvider<DataSource> dataSource,
            @Value("${draazy.scheduling.job-lock.enabled:true}") boolean lockEnabled) {
        this.scheduler = scheduler;
        this.dataSource = dataSource;
        this.lockEnabled = lockEnabled;
    }

    @Override
    public void configureTasks(ScheduledTaskRegistrar registrar) {
        TaskScheduler delegate = scheduler.getIfUnique();
        if (delegate == null) {
            return;
        }
        DataSource source = lockEnabled ? dataSource.getIfAvailable() : null;
        registrar.setTaskScheduler(new JobRunScheduler(delegate, source == null ? null : new JobLock(source)));
    }
}