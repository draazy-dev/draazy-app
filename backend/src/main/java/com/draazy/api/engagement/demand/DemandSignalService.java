package com.draazy.api.engagement.demand;

import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.identity.auth.Tokens;
import com.draazy.api.security.AuthPrincipal;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DemandSignalService {
    private final DemandSignalRepository repository;
    private final PropertyRepository properties;

    public DemandSignalService(DemandSignalRepository repository, PropertyRepository properties) {
        this.repository = repository;
        this.properties = properties;
    }

    @Transactional
    public void record(DemandSignalCreate body, AuthPrincipal principal, String remoteAddress) {
        DemandSignal signal = new DemandSignal();
        signal.setKind(body.kind());
        signal.setLocalitySlug(blankToNull(body.localitySlug()));
        signal.setDeal(blankToNull(body.deal()));
        signal.setBhk(blankToNull(body.bhk()));
        signal.setPropertyId(body.propertyId());
        signal.setUserId(principal == null ? null : principal.userId());
        repository.save(signal);
        if ("view".equals(body.kind()) && body.propertyId() != null) {
            properties.countView(body.propertyId(), signal.getUserId(), viewerKey(signal.getUserId(), remoteAddress));
        }
    }

    static String viewerKey(UUID userId, String remoteAddress) {
        return userId != null ? "u:" + userId
                : "ip:" + Tokens.sha256Hex("property-view:" + (remoteAddress == null ? "" : remoteAddress));
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
