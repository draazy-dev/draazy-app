package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.ConflictException;

final class FlatmateConflicts {
    private FlatmateConflicts() {
    }

    static final String ALREADY_INTERESTED = "already_interested";

    static final String GROUP_FULL = "group_full";

    static final String ROOM_FULL = "room_full";

    static final String GROUP_LIMIT = "group_limit";

    static final String HOST_CAPPED = "host_capped";

    static final String DUPLICATE_ADDRESS = "duplicate_address";

    static final String ALREADY_DECIDED = "already_decided";

    static final String SPLIT_ROOM = "split_room";

    static final String IDENTITY_REQUIRED = "identity_required";

    private static ConflictException marked(String prose, String subCode) {
        return new ConflictException(prose.strip() + " (" + subCode + ")");
    }

    static ConflictException alreadyInterested(String prose) {
        return marked(prose, ALREADY_INTERESTED);
    }

    static ConflictException groupFull(String prose) {
        return marked(prose, GROUP_FULL);
    }

    static ConflictException roomFull(String prose) {
        return marked(prose, ROOM_FULL);
    }

    static ConflictException groupLimit(String prose) {
        return marked(prose, GROUP_LIMIT);
    }

    static String guardrailSubCode(boolean overCap, boolean duplicate) {
        if (overCap) {
            return HOST_CAPPED;
        }
        return duplicate ? DUPLICATE_ADDRESS : null;
    }

    static String mark(String prose, String subCode) {
        return subCode == null ? prose.strip() : prose.strip() + " (" + subCode + ")";
    }
}
