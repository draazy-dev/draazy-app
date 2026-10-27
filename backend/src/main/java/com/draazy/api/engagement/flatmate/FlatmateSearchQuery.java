package com.draazy.api.engagement.flatmate;

import com.draazy.api.engagement.livingstyle.LivingStyleViewer;
import java.util.List;
import java.util.Map;

/** Every facet in one value, the line the client doesn't cross.
 * Clamps and per-parameter semantics: docs/flows/consumer/flatmates.md §5. */
public record FlatmateSearchQuery(
        String tab,
        String q,
        String locality,
        Double nearLat,
        Double nearLng,
        Double nearRadiusKm,
        Long minBudget,
        Long maxBudget,
        String gender,
        boolean verifiedOnly,
        Integer moveInDays,
        Map<String, List<Integer>> vibe,
        String attachedBath,
        Integer sharing,
        String sort,
        List<String> meLocalities,
        Long meBudget,
        String meGender,
        LivingStyleViewer meStyle,
        boolean strictGender,
        String roomType,
        String furnishing,
        boolean gated) {

    /** Widest circle searched: an unclamped radius turns a bounded index range into a full scan. */
    public static final double MAX_RADIUS_KM = 50.0;

    /** Privacy floor: an exact great-circle test with a tiny radius trilaterates a group's flat. */
    public static final double MIN_RADIUS_KM = 0.5;

    /** Unclamped, {@code current_date + :moveInDays} overflows the date type, a 500 reachable anonymously. */
    public static final int MAX_MOVE_IN_DAYS = 730;

    /** Each element adds a predicate and bind to both union halves, so length sizes SQL on a login-free route. */
    public static final int MAX_LIST_VALUES = 12;

    /** Every sort the board offers. An unknown value falls back rather than 500s. */
    public static final String SORT_VERIFIED = "verified";
    public static final String SORT_NEWEST = "newest";
    public static final String SORT_BUDGET_LOW = "budget-low";
    public static final String SORT_BUDGET_HIGH = "budget-high";
    public static final String SORT_MATCH = "match";

    public FlatmateSearchQuery {
        tab = FlatmateVocabulary.resolveTab(tab, null);
        q = FlatmateVocabulary.blankToNull(q);
        locality = FlatmateVocabulary.blankToNull(locality);
        gender = oneOf(gender, FlatmateVocabulary.GENDER);
        attachedBath = oneOf(attachedBath, FlatmateVocabulary.ATTACHED_BATH);
        roomType = oneOf(roomType, FlatmateVocabulary.ROOM_TYPE_FACET);
        furnishing = oneOf(furnishing, FlatmateVocabulary.FURNISHING);
        /* "Only women" means nothing beside `any`, which names no one to exclude. */
        strictGender = strictGender && gender != null && !"any".equals(gender);
        vibe = vibe == null ? Map.of() : vibe;
        /* A group cannot have fewer than one seat, so a zero or negative `sharing` is malformed
           rather than narrow — dropped like an unknown enum member. */
        sharing = sharing == null || sharing < 1 ? null : sharing;
        moveInDays = moveInDays == null ? null
                : Math.clamp(moveInDays, 0, MAX_MOVE_IN_DAYS);
        /* An unrecognised sort orders by trust rather than 400ing: a sort key comes from a query
           string, so it survives deep links, saved alerts and a release that renames one. */
        sort = switch (FlatmateVocabulary.blankToNull(sort) == null ? "" : sort) {
            case SORT_NEWEST, SORT_BUDGET_LOW, SORT_BUDGET_HIGH, SORT_MATCH -> sort;
            default -> SORT_VERIFIED;
        };
        meLocalities = cleanList(meLocalities);
        meGender = FlatmateVocabulary.blankToNull(meGender);
        meStyle = meStyle == null ? LivingStyleViewer.NONE : meStyle;
    }

    public FlatmateSearchQuery(String tab, String q, String locality, Double nearLat, Double nearLng,
            Double nearRadiusKm, Long minBudget, Long maxBudget, String gender, boolean verifiedOnly,
            Integer moveInDays, Map<String, List<Integer>> vibe, String attachedBath, Integer sharing, String sort,
            List<String> meLocalities, Long meBudget, String meGender) {
        this(tab, q, locality, nearLat, nearLng, nearRadiusKm, minBudget, maxBudget, gender, verifiedOnly,
                moveInDays, vibe, attachedBath, sharing, sort, meLocalities, meBudget, meGender, null,
                false, null, null, false);
    }

    /** Unrecognised facets are dropped: passing one narrows to empty, which reads as "nothing here". */
    private static String oneOf(String value, java.util.Set<String> allowed) {
        String clean = FlatmateVocabulary.blankToNull(value);
        if (clean == null) {
            return null;
        }
        String lower = clean.toLowerCase(java.util.Locale.ROOT);
        return allowed.contains(lower) ? lower : null;
    }

    private static List<String> cleanList(List<String> values) {
        return values == null ? List.of()
                : values.stream().map(FlatmateVocabulary::blankToNull)
                        .filter(java.util.Objects::nonNull).distinct()
                        .limit(MAX_LIST_VALUES).toList();
    }

    /** The unfiltered default page load — the request that must never be slow and never fail. */
    public static FlatmateSearchQuery emptyFor(String tab) {
        return new FlatmateSearchQuery(tab, null, null, null, null, null, null, null, null,
                false, null, Map.of(), null, null, null, List.of(), null, null);
    }

    /** Without a match value every row ties, so SQL skips the scoring expression and falls through to recency. */
    public boolean scoresAgainstMe() {
        return SORT_MATCH.equals(sort)
                && (!meLocalities.isEmpty() || meBudget != null || meGender != null || meStyle.scorable());
    }

    public boolean movingIn() {
        return FlatmateVocabulary.TAB_MOVE_IN.equals(tab);
    }

    /** The same facets on another tab, for the counts the tab labels show. */
    public FlatmateSearchQuery withTab(String otherTab) {
        return new FlatmateSearchQuery(
                otherTab,
                q, locality, nearLat, nearLng, nearRadiusKm, minBudget, maxBudget, gender,
                verifiedOnly, moveInDays, vibe, attachedBath, sharing, sort, meLocalities,
                meBudget, meGender, meStyle, strictGender, roomType, furnishing, gated);
    }

    public FlatmateSearchQuery withStyle(LivingStyleViewer viewer) {
        return new FlatmateSearchQuery(tab, q, locality, nearLat, nearLng, nearRadiusKm, minBudget,
                maxBudget, gender, verifiedOnly, moveInDays, vibe, attachedBath, sharing, sort,
                meLocalities, meBudget, meGender, viewer, strictGender, roomType, furnishing, gated);
    }

    /** A centre without a radius (or vice versa) narrows nothing; mirrors {@code ListingFacets.hasNearPoint}. */
    public boolean hasNearPoint() {
        return nearLat != null && nearLng != null && nearRadiusKm != null && nearRadiusKm > 0;
    }

    public double effectiveRadiusKm() {
        return Math.clamp(nearRadiusKm, MIN_RADIUS_KM, MAX_RADIUS_KM);
    }

    /** Maps to the group vocabulary ({@code any|women|men}); {@code female} matches no group; unknown widens. */
    public String policy() {
        if (gender == null) {
            return null;
        }
        return switch (gender) {
            case "female" -> FlatmateVocabulary.POLICY_WOMEN;
            case "male" -> FlatmateVocabulary.POLICY_MEN;
            default -> null;
        };
    }
}
