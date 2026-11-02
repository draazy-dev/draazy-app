package com.draazy.api.admin.leads;

import com.draazy.api.admin.leads.LeadIngest.Incoming;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class LeadIntake {
    private static final Logger LOG = LoggerFactory.getLogger(LeadIntake.class);

    private final LeadSources sources;
    private final LeadIngest ingest;

    LeadIntake(LeadSources sources, LeadIngest ingest) {
        this.sources = sources;
        this.ingest = ingest;
    }

    @Transactional
    public long sweep() {
        long landed = 0;
        for (LeadSources.Feed feed : LeadSources.FEEDS) {
            for (Incoming incoming : sources.pull(feed)) {
                landed += ingest.ingest(incoming).isPresent() ? 1 : 0;
            }
        }
        if (landed > 0) {
            LOG.info("crm-lead-intake landed {} signals", landed);
        }
        return landed;
    }
}
