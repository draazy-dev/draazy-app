package com.draazy.api.engagement.flatmate;

import com.draazy.api.engagement.livingstyle.LivingStyleViewer;
import java.util.List;
import java.util.Map;

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
    public static final double MAX_RADIUS_KM = 50.0;

    public static final double MIN_RADIUS_KM = 0.5;

    public static final int MAX_MOVE_IN_DAYS = 730;

    public static final int MAX_LIST_VALUES = 12;

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
        strictGender = strictGender && gender != null && !"any".equals(gender);
        vibe = vibe == null ? Map.of() : vibe;
        sharing = sharing == null || sharing < 1 ? null : sharing;
        moveInDays = moveInDays == null ? null
                : Math.clamp(moveInDays, 0, MAX_MOVE_IN_DAYS);
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

    public static FlatmateSearchQuery emptyFor(String tab) {
        return new FlatmateSearchQuery(tab, null, null, null, null, null, null, null, null,
                false, null, Map.of(), null, null, null, List.of(), null, null);
    }

    public boolean scoresAgainstMe() {
        return SORT_MATCH.equals(sort)
                && (!meLocalities.isEmpty() || meBudget != null || meGender != null || meStyle.scorable());
    }

    public boolean movingIn() {
        return FlatmateVocabulary.TAB_MOVE_IN.equals(tab);
    }

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

    public boolean hasNearPoint() {
        return nearLat != null && nearLng != null && nearRadiusKm != null && nearRadiusKm > 0;
    }

    public double effectiveRadiusKm() {
        return Math.clamp(nearRadiusKm, MIN_RADIUS_KM, MAX_RADIUS_KM);
    }

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
