package com.draazy.api.services;

import static org.assertj.core.api.Assertions.assertThat;

import com.draazy.api.catalog.property.Property;
import com.draazy.api.identity.user.User;
import com.draazy.api.security.Teams;
import com.draazy.api.services.request.ServiceRequest;
import com.draazy.api.services.request.ServiceRequestStatus;
import com.draazy.api.services.request.ServiceRequestTypes;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("D11 — service request status is stored and read as its wire value")
class ServiceRequestStatusWireTest extends ServiceFixtures {
    @Test
    @DisplayName("all nine statuses survive a round trip through the column")
    void everyStatusRoundTripsThroughTheColumn() {
        User buyer = customer("9000000041");
        for (ServiceRequestStatus status : ServiceRequestStatus.values()) {
            UUID id = insertWithRawStatus(buyer, status.wire());

            ServiceRequest loaded = requestRepo.findById(id).orElseThrow();

            assertThat(loaded.getStatus())
                    .as("status literal '%s' must read back as %s", status.wire(), status.name())
                    .isEqualTo(status);
        }
    }

    @Test
    @DisplayName("a rejected draft writes 'changes-requested' to the column, not the constant name")
    void aHyphenatedStatusIsWrittenAsItsWireForm() throws Exception {
        User buyer = customer("9000000042");
        User desk = staff("9000000043", Teams.RENTAL);
        Property listing = listing(buyer);

        String id = raise(buyer, ServiceRequestTypes.RENT_AGREEMENT, listing);

        setStatus(desk, id, "in-progress", 200);
        shareDraft(desk, id, 200);
        reject(buyer, id, "Please fix the start date", 200);

        String stored = jdbc.queryForObject(
                "select status from service_requests where id = ?", String.class,
                UUID.fromString(id));

        assertThat(stored).isEqualTo("changes-requested");
    }

    private UUID insertWithRawStatus(User requester, String status) {
        return jdbc.queryForObject(
                "insert into service_requests (requester_id, type, team, status) "
                        + "values (?, ?, ?, ?) returning id",
                UUID.class, requester.getId(), ServiceRequestTypes.LEGAL,
                ServiceRequestTypes.teamFor(ServiceRequestTypes.LEGAL), status);
    }
}
