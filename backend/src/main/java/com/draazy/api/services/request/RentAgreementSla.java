package com.draazy.api.services.request;

import java.time.Duration;
import java.time.Instant;
import java.util.Collections;
import java.util.EnumMap;
import java.util.Map;

public final class RentAgreementSla {
    static final String DESK = "desk";
    static final String CUSTOMER = "customer";
    static final String TENANT = "tenant";

    static final Duration PICKUP = Duration.ofHours(4);
    static final Duration FIRST_DRAFT = Duration.ofHours(48);
    static final Duration REVISION = Duration.ofHours(24);
    static final Duration REGISTRATION = Duration.ofDays(7);

    private static final Map<ServiceRequestStatus, Duration> DESK_TARGETS = new EnumMap<>(Map.of(
            ServiceRequestStatus.NEW, PICKUP,
            ServiceRequestStatus.ASSIGNED, FIRST_DRAFT,
            ServiceRequestStatus.IN_PROGRESS, FIRST_DRAFT,
            ServiceRequestStatus.CHANGES_REQUESTED, REVISION,
            ServiceRequestStatus.APPROVED, REGISTRATION));

    private RentAgreementSla() {
    }

    public static Map<ServiceRequestStatus, Duration> deskTargets() {
        return Collections.unmodifiableMap(DESK_TARGETS);
    }

    static ServiceRequestDto.Sla of(ServiceRequest request, Instant now, boolean waitingOnTenant) {
        return waitingOnTenant ? new ServiceRequestDto.Sla(TENANT, null, false) : of(request, now);
    }

    static ServiceRequestDto.Sla of(ServiceRequest request, Instant now) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            return null;
        }
        if (request.getStatus() == ServiceRequestStatus.DRAFT_SHARED
                || request.getStatus() == ServiceRequestStatus.ACTION_REQUIRED) {
            return new ServiceRequestDto.Sla(CUSTOMER, null, false);
        }
        Duration target = DESK_TARGETS.get(request.getStatus());
        if (target == null || request.getStatusChangedAt() == null) {
            return null;
        }
        Instant due = request.getStatusChangedAt().plus(target);
        return new ServiceRequestDto.Sla(DESK, due, now.isAfter(due));
    }
}
