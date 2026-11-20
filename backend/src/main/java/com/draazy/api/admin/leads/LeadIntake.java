package com.draazy.api.admin.leads;

import com.draazy.api.common.persistence.Savepoints;
import java.util.concurrent.atomic.AtomicLong;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class LeadIntake {
    private static final Logger LOG = LoggerFactory.getLogger(LeadIntake.class);

    private final LeadSources sources;
    private final LeadIngest ingest;
    private final DataSource dataSource;

    LeadIntake(LeadSources sources, LeadIngest ingest, DataSource dataSource) {
        this.sources = sources;
        this.ingest = ingest;
        this.dataSource = dataSource;
    }

    @Transactional
    public long sweep() {
        long landed = 0;
        for (LeadSources.Feed feed : LeadSources.FEEDS) {
            AtomicLong fromFeed = new AtomicLong();
            try {
                Savepoints.isolated(dataSource, () -> fromFeed.set(sources.pull(feed).stream()
                        .filter(incoming -> ingest.ingest(incoming).isPresent()).count()));
                landed += fromFeed.get();
            } catch (RuntimeException e) {
                LOG.warn("crm-lead-intake feed {} failed", feed.source(), e);
            }
        }
        if (landed > 0) {
            LOG.info("crm-lead-intake landed {} signals", landed);
        }
        return landed;
    }
}
