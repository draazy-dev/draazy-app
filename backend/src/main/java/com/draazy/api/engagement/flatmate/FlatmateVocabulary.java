package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.identity.user.User;
import java.util.Set;

public final class FlatmateVocabulary {
    private FlatmateVocabulary() {
    }

    public static final Set<String> GENDER = Set.of("any", "male", "female");

    public static final Set<String> FOOD = Set.of("any", "veg", "nonveg");

    public static final Set<String> FLAT_PREF = Set.of("any", "women", "men");

    public static final Set<String> ROOM_PREF = Set.of("any", "private", "shared");

    public static final Set<String> POLICY = Set.of("any", "women", "men");

    public static final Set<String> ROOM_KIND = Set.of("master", "bedroom", "living");

    public static final Set<String> ROOM_TYPE = Set.of("Private room", "Shared room");

    static final String ROOM_DOUBLE = "Shared room";

    public static final Set<String> ROOM_TYPE_FACET = Set.of("private", "shared");

    public static final Set<String> ATTACHED_BATH = Set.of("attached", "shared");

    public static final Set<String> FURNISHING = Set.of("unfurnished", "semi", "furnished");
    public static final Set<String> PARKING = Set.of("bike", "car");

    public static final Set<String> BILLING = Set.of("included", "shared", "separate");

    public static final Set<String> BHK = Set.of("1", "2", "3", "4");

    public static final int MAX_LOCALITIES = 3;

    public static final Set<String> HOME_TYPE =
            Set.of("Flat", "Independent House", "Villa", "Row House");

    public static final Set<String> HOST_ROLE = Set.of("owner", "tenant");

    public static final Set<String> MOD_STATUS =
            Set.of("pending", "live", "approved", "flagged", "removed", "rejected");

    public static final Set<String> MOD_PUBLIC = Set.of("live", "approved");

    public static final Set<String> SHARE_INTENT = Set.of("solo", "bring", "match");

    public static final Set<String> REQUEST_STATUS = Set.of("pending", "accepted", "declined");

    public static final Set<String> DECISION = Set.of("accepted", "declined");

    public static final Set<String> REVIEW_STATUS = Set.of("pending", "approved", "rejected");

    public static final String STATUS_APPROVED = "approved";

    public static final String STATUS_REJECTED = "rejected";

    public static final Set<String> TAB = Set.of("move-in", "team-up", "people", "teams");

    public static final String TAB_MOVE_IN = "move-in";
    public static final String TAB_TEAM_UP = "team-up";
    public static final String TAB_PEOPLE = "people";
    public static final String TAB_TEAMS = "teams";

    public static final String TIER_IDENTITY = "identity";
    public static final String TIER_TENANT = "tenant";
    public static final String TIER_OWNER = "owner";

    public static final String ROLE_OWNER = "owner";
    public static final String ROLE_TENANT = "tenant";

    public static final String POLICY_OPEN = "any";

    public static final String POLICY_WOMEN = "women";
    public static final String POLICY_MEN = "men";
    public static final String STATUS_PENDING = "pending";
    public static final String STATUS_ACCEPTED = "accepted";
    public static final String MOD_LIVE = "live";

    public static final String MOD_APPROVED = "approved";

    public static final String MOD_PENDING = "pending";

    public static final String MOD_EXPIRED = "expired";

    static final String NO_CONTACT = "must not contain a phone number, email address or messaging link."
            + " People reach you through Draazy";

    public static boolean isPublic(String modStatus) {
        return modStatus != null && MOD_PUBLIC.contains(modStatus);
    }

    public static String resolveTab(String tab, String legacyView) {
        if (tab != null && !tab.isBlank()) {
            return require(tab.strip(), TAB, "tab");
        }
        if (legacyView == null || legacyView.isBlank()) {
            return TAB_MOVE_IN;
        }
        return switch (legacyView.strip()) {
            case "rooms" -> TAB_MOVE_IN;
            case "flatmates", "groups" -> TAB_TEAM_UP;
            default -> TAB_MOVE_IN;
        };
    }

    public static String orDefault(String value, Set<String> allowed, String fallback, String field) {
        String trimmed = blankToNull(value);
        return trimmed == null ? fallback : require(trimmed, allowed, field);
    }

    public static String optional(String value, Set<String> allowed, String field) {
        String trimmed = blankToNull(value);
        return trimmed == null ? null : require(trimmed, allowed, field);
    }

    public static String require(String value, Set<String> allowed, String field) {
        if (!allowed.contains(value)) {
            throw new BadRequestException(
                    "Unknown " + field + ": '" + value + "'. Expected one of "
                            + String.join(", ", allowed.stream().sorted().toList()) + ".");
        }
        return value;
    }

    public static String blankToNull(String value) {
        return (value == null || value.isBlank()) ? null : value.strip();
    }

    static String profileName(User author) {
        String name = blankToNull(author.getName());
        if (name == null) {
            throw new ValidationException("Add your name to your profile before posting.");
        }
        return name;
    }
}
