package com.draazy.api.catalog.property;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;

public final class AddressKey {
    private AddressKey() {
    }

    private static final Set<String> FILLER = Set.of(
            "flat", "apt", "apartment", "unit", "room", "no", "number", "wing", "block", "tower",
            "bldg", "building", "society", "soc", "chs", "chsl", "the", "near", "opp", "opposite",
            "behind");

    public static String of(String address, String city, String locality) {
        if (address == null) {
            return null;
        }
        Set<String> drop = new HashSet<>(FILLER);
        drop.addAll(tokens(city));
        drop.addAll(tokens(locality));
        Set<String> kept = tokens(address).stream()
                .filter(token -> !drop.contains(token))
                .filter(token -> !token.matches("\\d{6}"))
                .collect(Collectors.toSet());
        if (kept.size() < 2) {
            return null;
        }
        return String.join(" ", new TreeSet<>(kept));
    }

    private static Set<String> tokens(String text) {
        if (text == null || text.isBlank()) {
            return Set.of();
        }
        return Arrays.stream(text.toLowerCase(Locale.ROOT).split("[^\\p{L}\\p{N}]+"))
                .filter(token -> !token.isEmpty())
                .collect(Collectors.toSet());
    }
}
