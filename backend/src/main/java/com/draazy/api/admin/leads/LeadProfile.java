package com.draazy.api.admin.leads;

import com.draazy.api.admin.leads.LeadRequests.Profile;
import com.draazy.api.common.error.BadRequestException;
import java.util.List;

public record LeadProfile(String leadType, String intent, List<String> propertyTypes, List<String> bhk,
        String localities, Long budget, String leadSource, String sourceDetail) {
    private static final long MAX_BUDGET = 100_000_000_000L;

    static final LeadProfile NONE = new LeadProfile(null, null, List.of(), List.of(), null, null, null, null);

    static LeadProfile of(Profile in) {
        if (in == null) {
            throw new BadRequestException("profile is required");
        }
        String type = LeadVocabulary.required(LeadVocabulary.LEAD_TYPES, in.leadType(), "leadType");
        String intent = blank(in.intent()) ? null
                : LeadVocabulary.required(LeadVocabulary.INTENTS.get(type), in.intent(), "intent");
        List<String> propertyTypes = LeadVocabulary.FLATMATE.equals(type) ? List.of()
                : LeadVocabulary.pick(LeadVocabulary.PROPERTY_TYPES, in.propertyTypes(), "property type");
        Long budget = in.budget();
        if (budget != null && (budget <= 0 || budget > MAX_BUDGET)) {
            throw new BadRequestException("budget must be a positive amount in rupees");
        }
        return new LeadProfile(type, intent, propertyTypes, LeadVocabulary.pick(LeadVocabulary.BHK, in.bhk(), "BHK"),
                text(in.localities(), 200, "localities"), budget,
                LeadVocabulary.required(LeadVocabulary.LEAD_SOURCES, in.leadSource(), "leadSource"),
                text(in.sourceDetail(), 120, "sourceDetail"));
    }

    static LeadProfile fed(String type, String intent, List<String> bhk, String localities, Long budget) {
        return new LeadProfile(type, intent, List.of(), bhk, blank(localities) ? null : cut(localities.strip(), 200),
                budget != null && budget > 0 ? budget : null, LeadVocabulary.DRAAZY, null);
    }

    static String name(Profile in) {
        return in == null ? null : text(in.name(), 80, "name");
    }

    private static String text(String value, int max, String field) {
        if (blank(value)) {
            return null;
        }
        String trimmed = value.strip();
        if (trimmed.length() > max) {
            throw new BadRequestException(field + " must be at most " + max + " characters");
        }
        return trimmed;
    }

    private static String cut(String value, int max) {
        return value.length() > max ? value.substring(0, max) : value;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}
