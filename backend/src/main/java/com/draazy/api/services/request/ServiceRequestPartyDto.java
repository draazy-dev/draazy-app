package com.draazy.api.services.request;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.Instant;

public record ServiceRequestPartyDto(
        String id,
        String requestId,
        String requestType,
        String role,
        int partyIndex,
        String status,
        String party,
        String mobile,
        boolean pending,
        String invitedBy,
        Instant createdAt,
        @JsonInclude(JsonInclude.Include.NON_NULL) Boolean whatsappQueued) {

    ServiceRequestPartyDto withWhatsappQueued(Boolean queued) {
        return new ServiceRequestPartyDto(id, requestId, requestType, role, partyIndex, status, party, mobile,
                pending, invitedBy, createdAt, queued);
    }
}
