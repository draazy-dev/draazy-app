package com.draazy.api.services.request;

import java.time.Instant;

public record ServiceRequestIdentityDto(
        String partyRole,
        int partyIndex,
        String partyName,
        String pan,
        String aadhaar,
        Instant purgedAt) {
    static ServiceRequestIdentityDto of(ServiceRequestIdentity row) {
        return new ServiceRequestIdentityDto(row.getPartyRole(), row.getPartyIndex(),
                row.getPartyName(), row.getPan(), row.getAadhaar(), row.getPurgedAt());
    }
}
