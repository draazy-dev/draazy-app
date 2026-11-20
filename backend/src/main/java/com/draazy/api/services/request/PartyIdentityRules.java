package com.draazy.api.services.request;

import java.time.LocalDate;
import java.time.Period;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

final class PartyIdentityRules {

    private static final int MIN_AGE = 18;
    private static final int MAX_AGE = 150;
    private static final int MAX_MOTHER = 80;
    private static final int MAX_VILLAGE = 80;
    private static final int MAX_ADDRESS = 200;
    private static final Set<String> GENDERS = Set.of("male", "female", "other");
    private static final Pattern PINCODE = Pattern.compile("^[1-9][0-9]{5}$");

    private PartyIdentityRules() {
    }

    static void check(Map<String, Object> state, List<Map<?, ?>> coOwners, List<Map<?, ?>> tenants,
            LocalDate today, List<String> problems) {
        Map<String, Object> owner = ServiceRequestPricing.childObject(state, "owner");
        row(owner, "_state.owner", "oDob", "oAge", today, problems);
        personal(owner, "_state.owner", problems);
        address(owner.get("addr"), "_state.owner.addr", problems);
        for (int i = 0; i < coOwners.size(); i++) {
            String path = "_state.coOwners[" + i + "]";
            row(coOwners.get(i), path, "dob", "age", today, problems);
            personal(coOwners.get(i), path, problems);
            address(coOwners.get(i).get("addr"), path + ".addr", problems);
        }
        for (int i = 0; i < tenants.size(); i++) {
            String path = "_state.tenants[" + i + "]";
            row(tenants.get(i), path, "dob", "age", today, problems);
            personal(tenants.get(i), path, problems);
        }
    }

    private static void personal(Map<?, ?> row, String path, List<String> problems) {
        maxLength(row.get("mother"), path + ".mother", MAX_MOTHER, problems);
        gender(row.get("gender"), path + ".gender", problems);
    }

    private static void address(Object raw, String path, List<String> problems) {
        if (!(raw instanceof Map<?, ?> addr)) {
            return;
        }
        pincode(addr.get("pincode"), path + ".pincode", problems);
        maxLength(addr.get("village"), path + ".village", MAX_VILLAGE, problems);
        maxLength(addr.get("address"), path + ".address", MAX_ADDRESS, problems);
    }

    private static void gender(Object raw, String path, List<String> problems) {
        if (stated(raw) && !GENDERS.contains(raw.toString())) {
            problems.add(path + " must be male, female or other");
        }
    }

    private static void pincode(Object raw, String path, List<String> problems) {
        if (stated(raw) && !PINCODE.matcher(raw.toString().trim()).matches()) {
            problems.add(path + " must be a 6-digit pincode");
        }
    }

    private static void maxLength(Object raw, String path, int max, List<String> problems) {
        if (stated(raw) && raw.toString().trim().length() > max) {
            problems.add(path + " must be at most " + max + " characters");
        }
    }

    private static void row(Map<?, ?> row, String path, String dobKey, String ageKey, LocalDate today,
            List<String> problems) {
        if (!stated(row.get(dobKey))) {
            return;
        }
        LocalDate dob = date(row.get(dobKey), path + "." + dobKey, today, problems);
        if (dob == null) {
            return;
        }
        int age = Period.between(dob, today).getYears();
        if (age < MIN_AGE || age > MAX_AGE) {
            problems.add(path + "." + dobKey + " must make the party " + MIN_AGE + " to " + MAX_AGE + " years old");
        }
        if (stated(row.get(ageKey))) {
            Long statedAge = integer(row.get(ageKey));
            if (statedAge != null && statedAge.intValue() != age) {
                problems.add(path + "." + ageKey + " must match " + path + "." + dobKey);
            }
        }
    }

    private static LocalDate date(Object raw, String path, LocalDate today, List<String> problems) {
        try {
            LocalDate dob = LocalDate.parse(raw.toString());
            if (dob.isAfter(today)) {
                problems.add(path + " must not be after today");
                return null;
            }
            return dob;
        } catch (DateTimeParseException malformed) {
            problems.add(path + " must be an ISO date yyyy-MM-dd");
            return null;
        }
    }

    private static Long integer(Object raw) {
        try {
            return Long.valueOf(raw.toString().trim());
        } catch (NumberFormatException malformed) {
            return null;
        }
    }

    private static boolean stated(Object value) {
        return value != null && !value.toString().isBlank();
    }
}
