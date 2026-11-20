package com.draazy.api.services.support;

import com.draazy.api.services.support.StaffSupportChatDto.Scope;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;

/** Which chat contexts a staff member may see; `desks` narrows the request context to their own teams. */
record SupportChatScope(boolean full, Set<String> contexts, Set<String> desks) {
    static final SupportChatScope FULL = new SupportChatScope(true, Set.of(), Set.of());

    private static final List<String> VOCABULARY = List.of("general", "property", "flatmate", "request", "identity",
            "invoice");
    private static final Map<String, List<String>> TYPES = Map.of(
            "property", List.of("property"),
            "flatmate", List.of("flatmate_room", "flatmate_group", "flatmate_post"),
            "identity", List.of("identity"),
            "invoice", List.of("invoice"));

    boolean isEmpty() {
        return !full && contexts.isEmpty();
    }

    static String contextOf(String aboutType) {
        return aboutType != null && aboutType.startsWith("flatmate_") ? "flatmate" : aboutType;
    }

    boolean allows(String aboutType) {
        return full || contexts.contains(contextOf(aboutType == null ? "general" : aboutType));
    }

    Scope dto() {
        return new Scope(full, VOCABULARY.stream().filter(c -> full || contexts.contains(c)).toList());
    }

    /** SQL over an about_type/about_id pair; request topics also need the request to sit on one of our desks. */
    String about(String typeCol, String idCol, MapSqlParameterSource params) {
        if (full) {
            return "true";
        }
        Set<String> types = new LinkedHashSet<>();
        contexts.forEach(c -> types.addAll(TYPES.getOrDefault(c, List.of())));
        List<String> parts = new ArrayList<>();
        if (!types.isEmpty()) {
            parts.add(typeCol + " in (:scopeTypes)");
            params.addValue("scopeTypes", types);
        }
        if (allows("request")) {
            parts.add("(" + typeCol + " = 'request' and exists (select 1 from service_requests scope_sr"
                    + " where scope_sr.id = case when " + typeCol + " = 'request' then " + idCol + "::uuid end"
                    + " and scope_sr.team in (:scopeDesks)))");
            params.addValue("scopeDesks", desks);
        }
        return parts.isEmpty() ? "false" : "(" + String.join(" or ", parts) + ")";
    }

    String requestTeam(String teamCol, MapSqlParameterSource params) {
        if (full) {
            return "true";
        }
        if (!allows("request")) {
            return "false";
        }
        params.addValue("scopeDesks", desks);
        return teamCol + " in (:scopeDesks)";
    }
}
