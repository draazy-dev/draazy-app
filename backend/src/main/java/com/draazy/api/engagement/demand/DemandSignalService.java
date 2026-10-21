package com.draazy.api.engagement.demand;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.security.AuthPrincipal;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Sole writer of {@link DemandSignal}. No dedupe or throttle (repeat interest is the reader's call;
 * WriteRateLimitFilter bounds volume), and slugs stay unvalidated so uncovered places still count. */
@Service
public class DemandSignalService {

    private final DemandSignalRepository repository;
    private final PropertyRepository properties;

    public DemandSignalService(DemandSignalRepository repository, PropertyRepository properties) {
        this.repository = repository;
        this.properties = properties;
    }

    /** {@code principal} is null for signed-out visitors, the common case; alerts are recorded before the
     * sign-in redirect so cold-start demand still counts. */
    @Transactional
    public void record(DemandSignalCreate body, AuthPrincipal principal) {
        DemandSignal signal = new DemandSignal();
        signal.setKind(body.kind());
        signal.setLocalitySlug(blankToNull(body.localitySlug()));
        signal.setDeal(blankToNull(body.deal()));
        signal.setBhk(blankToNull(body.bhk()));
        signal.setPropertyId(body.propertyId());
        signal.setUserId(principal == null ? null : principal.userId());
        repository.save(signal);
        if ("view".equals(body.kind()) && body.propertyId() != null) {
            properties.countView(body.propertyId(), signal.getUserId());
        }
    }

    // The client sends '' for "no locality"; storing it as-is would group-by into a second, nameless place.
    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
