package com.draazy.api.services.ticket;

import com.draazy.api.security.Teams;
import java.util.Map;

public final class ServiceWaitlists {
    public static final String MOVE_IN_PACK = "move-in-pack";

    private static final Map<String, String> TEAMS = Map.of(MOVE_IN_PACK, Teams.PACKERS);

    private static final Map<String, String> SUBJECTS =
            Map.of(MOVE_IN_PACK, "Move-in Pack — waitlist");

    private ServiceWaitlists() {
    }

    public static boolean isKnown(String slug) {
        return slug != null && TEAMS.containsKey(slug);
    }

    public static String teamFor(String slug) {
        return TEAMS.get(slug);
    }

    public static String subjectFor(String slug) {
        return SUBJECTS.get(slug);
    }
}
