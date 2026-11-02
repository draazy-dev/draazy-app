package com.draazy.api.services.request;

import com.draazy.api.security.Teams;
import java.util.Map;
import java.util.Set;

public final class ServiceRequestTypes {
    private ServiceRequestTypes() {
    }

    public static final String RENT_AGREEMENT = "rent-agreement";

    public static final String LEGAL = "legal";

    public static final String INTERIOR = "interior";

    public static final String PACKERS = "packers";

    public static final String VALUATION = "valuation";

    private static final Set<String> KNOWN =
            Set.of(RENT_AGREEMENT, LEGAL, INTERIOR, PACKERS, VALUATION);

    private static final Map<String, String> TEAM_BY_TYPE = Map.of(
            RENT_AGREEMENT, Teams.RENTAL,
            LEGAL, Teams.LEGAL,
            INTERIOR, Teams.INTERIOR,
            PACKERS, Teams.PACKERS,
            VALUATION, Teams.VALUATION);

    private static final Map<String, String> PAGE_BY_TYPE = Map.of(
            RENT_AGREEMENT, "/services/rent-agreement",
            LEGAL, "/services/property-legal",
            INTERIOR, "/services/interior-renovation",
            PACKERS, "/services/packers-movers",
            VALUATION, "/services/property-valuation");

    static {
        if (!TEAM_BY_TYPE.keySet().equals(KNOWN)) {
            throw new IllegalStateException(
                    "Every service request type must name the desk that works it. Unmapped: "
                            + KNOWN.stream().filter(t -> !TEAM_BY_TYPE.containsKey(t)).sorted().toList()
                            + "; mapped but not a known type: "
                            + TEAM_BY_TYPE.keySet().stream().filter(t -> !KNOWN.contains(t)).sorted()
                                    .toList());
        }
        if (!PAGE_BY_TYPE.keySet().equals(KNOWN)) {
            throw new IllegalStateException(
                    "Every service request type must name the page its customer is sent to. Unmapped: "
                            + KNOWN.stream().filter(t -> !PAGE_BY_TYPE.containsKey(t)).sorted().toList()
                            + "; mapped but not a known type: "
                            + PAGE_BY_TYPE.keySet().stream().filter(t -> !KNOWN.contains(t)).sorted()
                                    .toList());
        }
    }

    public static boolean isKnown(String type) {
        return KNOWN.contains(type);
    }

    public static Set<String> known() {
        return KNOWN;
    }

    public static String teamFor(String type) {
        String team = TEAM_BY_TYPE.get(type);
        if (team == null) {
            throw new IllegalStateException("No ops desk is mapped to service request type '" + type
                    + "'. Add it to ServiceRequestTypes.TEAM_BY_TYPE and to the V72 "
                    + "service_requests_type_team_check, or the request belongs to nobody.");
        }
        return team;
    }

    // The back office routes each desk at /admin/<type> and opens the case named by ?request=.
    public static String deskFor(ServiceRequest request) {
        teamFor(request.getType());
        return "/admin/" + request.getType() + "?request=" + request.getId();
    }

    public static Map<String, String> teams() {
        return TEAM_BY_TYPE;
    }

    public static String pageFor(String type) {
        String page = PAGE_BY_TYPE.get(type);
        if (page == null) {
            throw new IllegalStateException("No customer page is mapped to service request type '"
                    + type + "'. Add it to ServiceRequestTypes.PAGE_BY_TYPE, or every notification "
                    + "about it links nowhere.");
        }
        return page;
    }
}
