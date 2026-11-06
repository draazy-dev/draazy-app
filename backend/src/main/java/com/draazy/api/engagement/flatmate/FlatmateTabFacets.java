package com.draazy.api.engagement.flatmate;

import java.util.Locale;
import java.util.Map;
import java.util.Set;

// Shared by the feed and SavedSearchMatcher so a saved alert matches exactly what the feed showed.
public record FlatmateTabFacets(
        String bhk,
        boolean vegOnly,
        String parking,
        Integer minAge,
        Integer maxAge,
        Integer minOpenSeats) {
    public static final FlatmateTabFacets NONE = new FlatmateTabFacets(null, false, null, null, null, null);

    public static final int MIN_AGE = 18;
    public static final int MAX_AGE = 99;
    public static final int MAX_OPEN_SEATS = 10;

    public FlatmateTabFacets {
        bhk = oneOf(bhk, FlatmateVocabulary.BHK);
        parking = oneOf(parking, FlatmateVocabulary.PARKING);
        minAge = age(minAge);
        maxAge = age(maxAge);
        if (minAge != null && maxAge != null && minAge > maxAge) {
            minAge = null;
            maxAge = null;
        }
        // One open seat is already the baseline for every listed group.
        minOpenSeats = minOpenSeats == null || minOpenSeats < 2 ? null : Math.min(minOpenSeats, MAX_OPEN_SEATS);
    }

    public void appendRoom(StringBuilder sql, Map<String, Object> params) {
        if (bhk != null) {
            sql.append(" and r.bhk = :tabBhk");
            params.put("tabBhk", bhk);
        }
        if (vegOnly) {
            sql.append(" and r.food = 'veg'");
        }
        if (parking != null) {
            // A car spot also takes a bike.
            sql.append("car".equals(parking) ? " and r.parking = 'car'" : " and r.parking in ('bike', 'car')");
        }
    }

    public void appendPost(StringBuilder sql, Map<String, Object> params) {
        if (minAge != null) {
            sql.append(" and p.age >= :minAge");
            params.put("minAge", minAge);
        }
        if (maxAge != null) {
            sql.append(" and p.age <= :maxAge");
            params.put("maxAge", maxAge);
        }
    }

    public void appendGroup(StringBuilder sql, Map<String, Object> params) {
        if (bhk != null) {
            // An empty pref_bhk means the team will take any size.
            sql.append(" and (jsonb_array_length(g.pref_bhk) = 0 or g.pref_bhk @> to_jsonb(cast(:tabBhk as text)))");
            params.put("tabBhk", bhk);
        }
        if (minOpenSeats != null) {
            // Mirrors FlatmateGroup.openSeats().
            sql.append(" and least(coalesce(g.seats_open, g.seats_total),"
                    + " g.seats_total - (select count(*) from flatmate_group_members gm where gm.group_id = g.id))"
                    + " >= :minOpenSeats");
            params.put("minOpenSeats", minOpenSeats);
        }
    }

    private static Integer age(Integer value) {
        return value == null || value < MIN_AGE ? null : Math.min(value, MAX_AGE);
    }

    private static String oneOf(String value, Set<String> allowed) {
        String clean = FlatmateVocabulary.blankToNull(value);
        String lower = clean == null ? null : clean.toLowerCase(Locale.ROOT);
        return lower != null && allowed.contains(lower) ? lower : null;
    }
}
