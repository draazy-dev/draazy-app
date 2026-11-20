package com.draazy.api.services.request;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ForbiddenException;
import com.draazy.api.security.AuthPrincipal;
import com.draazy.api.security.Roles;
import com.draazy.api.security.Teams;
import java.util.Set;

final class ServiceDeskAuthority {
    private ServiceDeskAuthority() {
    }

    // A deskless staff caller must be refused: null means every desk to the query.
    static String deskFilterFor(AuthPrincipal caller, String requestedTeam, Set<String> desks) {
        String requested = blankToNull(requestedTeam);
        if (requested != null && !Teams.isKnown(requested)) {
            throw new BadRequestException("Unknown team: " + requested);
        }
        if (Roles.Wire.ADMIN.equals(caller.role()) || Roles.Wire.MANAGER.equals(caller.role())) {
            return requested;
        }
        if (desks.isEmpty()) {
            throw new ForbiddenException(
                    "Your account is not on an ops desk yet, so there is no queue to show.");
        }
        if (requested != null && !desks.contains(requested)) {
            throw new ForbiddenException("You can only see your assigned queues.");
        }
        return requested == null && desks.size() == 1 ? desks.iterator().next() : requested;
    }

    static ServiceRequest onCallersDesk(AuthPrincipal caller, ServiceRequest request, Set<String> desks) {
        if (Roles.Wire.ADMIN.equals(caller.role()) || Roles.Wire.MANAGER.equals(caller.role())) {
            return request;
        }
        if (desks.isEmpty()) {
            throw new ForbiddenException("Your account is not on an ops desk yet.");
        }
        if (!desks.contains(request.getTeam())) {
            throw new ForbiddenException(
                    "That request belongs to the " + request.getTeam() + " desk.");
        }
        return request;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
