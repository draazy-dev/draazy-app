package com.draazy.api.admin.leads;

import com.draazy.api.common.error.BadRequestException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

final class LeadVocabulary {
    static final String NEW = "new";
    static final String CONTACTED = "contacted";
    static final String INTERESTED = "interested";
    static final String CONVERTED = "converted";
    static final String LOST = "lost";
    static final String NOT_REACHABLE = "not-reachable";
    static final String DO_NOT_CALL = "do-not-call";

    static final Set<String> STAGES = Set.of(NEW, CONTACTED, INTERESTED, CONVERTED, LOST, NOT_REACHABLE,
            DO_NOT_CALL);
    static final Set<String> OPEN_STAGES = Set.of(NEW, CONTACTED, INTERESTED);
    static final Set<String> SERVICES = Set.of("rent-agreement", "legal", "interior", "packers", "valuation",
            "loans", "listing", "home-search");
    static final Set<String> CHANNELS = Set.of("call", "whatsapp", "sms");
    static final Set<String> OUTCOMES = Set.of("connected", "no-answer", "busy", "switched-off", "wrong-number",
            "message-sent");
    static final Set<String> FAILED_OUTCOMES = Set.of("no-answer", "busy", "switched-off");
    static final Set<String> CONNECTED_OUTCOMES = Set.of("connected", "message-sent");
    static final String WRONG_NUMBER = "wrong-number";

    static final String OWNER = "owner";
    static final String SEEKER = "seeker";
    static final String FLATMATE = "flatmate";
    static final Set<String> LEAD_TYPES = Set.of(OWNER, SEEKER, FLATMATE);
    static final Map<String, Set<String>> INTENTS = Map.of(OWNER, Set.of("sell", "rent-out"),
            SEEKER, Set.of("buy", "rent"), FLATMATE, Set.of("has-room", "needs-room"));
    static final Set<String> PROPERTY_TYPES = Set.of("flat", "independent", "villa", "commercial", "openplot",
            "farmland");
    static final Set<String> BHK = Set.of("1rk", "1", "2", "3", "4", "5+");
    static final String DRAAZY = "draazy";
    static final Set<String> LEAD_SOURCES = Set.of("walk-in", "inbound-call", "whatsapp", "facebook", "instagram",
            "referral", "flyer", DRAAZY, "portal", "other");

    static final int MAX_FAILED_ATTEMPTS = 3;
    static final int OPEN_LEAD_CAP = 50;

    private LeadVocabulary() {
    }

    static boolean isOpen(String stage) {
        return OPEN_STAGES.contains(stage);
    }

    static List<String> services(List<String> requested) {
        return pick(SERVICES, requested, "service");
    }

    static List<String> pick(Set<String> allowed, List<String> requested, String label) {
        List<String> clean = new ArrayList<>();
        for (String value : requested == null ? List.<String>of() : requested) {
            if (value == null || !allowed.contains(value)) {
                throw new BadRequestException("Unknown " + label + ": " + value);
            }
            if (!clean.contains(value)) {
                clean.add(value);
            }
        }
        return clean.stream().sorted().toList();
    }

    static String required(Set<String> allowed, String value, String field) {
        if (value == null || !allowed.contains(value)) {
            throw new BadRequestException(field + " must be one of " + allowed.stream().sorted().toList());
        }
        return value;
    }
}
