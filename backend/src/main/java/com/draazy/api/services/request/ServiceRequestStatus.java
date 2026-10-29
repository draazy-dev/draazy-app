package com.draazy.api.services.request;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;
import jakarta.persistence.AttributeConverter;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public enum ServiceRequestStatus {
    AWAITING_PAYMENT("awaiting-payment"),

    NEW("new"),

    ASSIGNED("assigned"),

    IN_PROGRESS("in-progress"),

    DRAFT_SHARED("draft-shared"),

    CHANGES_REQUESTED("changes-requested"),

    /** The checker said yes. Only the customer can cause this. */
    APPROVED("approved"),

    COMPLETED("completed"),

    CANCELLED("cancelled");

    private final String wire;

    ServiceRequestStatus(String wire) {
        this.wire = wire;
    }

    @JsonValue
    public String wire() {
        return wire;
    }

    @Override
    public String toString() {
        return wire;
    }

    private static final Map<String, ServiceRequestStatus> BY_WIRE = byWire();

    private static Map<String, ServiceRequestStatus> byWire() {
        Map<String, ServiceRequestStatus> index = new HashMap<>();
        for (ServiceRequestStatus status : values()) {
            index.put(status.wire, status);
        }
        return Map.copyOf(index);
    }

    @JsonCreator
    public static ServiceRequestStatus fromWire(String wire) {
        ServiceRequestStatus status = BY_WIRE.get(wire);
        if (status == null) {
            throw new IllegalArgumentException("Unknown service request status: " + wire);
        }
        return status;
    }

    public static Optional<ServiceRequestStatus> parse(String wire) {
        return Optional.ofNullable(BY_WIRE.get(wire));
    }

    private static final Map<ServiceRequestStatus, Set<ServiceRequestStatus>> ALLOWED = Map.of(
            AWAITING_PAYMENT, Set.of(NEW, CANCELLED),
            NEW, Set.of(ASSIGNED, IN_PROGRESS, CANCELLED),
            ASSIGNED, Set.of(IN_PROGRESS, DRAFT_SHARED, CANCELLED),
            IN_PROGRESS, Set.of(ASSIGNED, DRAFT_SHARED, CANCELLED),
            DRAFT_SHARED, Set.of(APPROVED, CHANGES_REQUESTED, IN_PROGRESS, DRAFT_SHARED, CANCELLED),
            CHANGES_REQUESTED, Set.of(ASSIGNED, IN_PROGRESS, DRAFT_SHARED, CANCELLED),
            APPROVED, Set.of(COMPLETED, CANCELLED),
            COMPLETED, Set.of(),
            CANCELLED, Set.of());

    private static final Set<ServiceRequestStatus> STAFF_SETTABLE =
            Set.of(ASSIGNED, IN_PROGRESS, CANCELLED);

    public boolean canTransitionTo(ServiceRequestStatus target) {
        return ALLOWED.getOrDefault(this, Set.of()).contains(target);
    }

    public boolean isStaffSettable() {
        return STAFF_SETTABLE.contains(this);
    }

    public boolean isTerminal() {
        return this == COMPLETED || this == CANCELLED;
    }

    public static final class Converter implements AttributeConverter<ServiceRequestStatus, String> {
        @Override
        public String convertToDatabaseColumn(ServiceRequestStatus status) {
            return status == null ? null : status.wire;
        }

        @Override
        public ServiceRequestStatus convertToEntityAttribute(String column) {
            return column == null ? null : fromWire(column);
        }
    }
}
