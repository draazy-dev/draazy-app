package com.draazy.api.common.settings;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class GeoPolicyController {
    private static final Logger log = LoggerFactory.getLogger(GeoPolicyController.class);

    private static final String GEO_KEY = "geo";

    private static final int MIN_BLACKLIST_TERM = 2;

    private static final double MAX_LATITUDE = 90;
    private static final double MAX_LONGITUDE = 180;

    private final SettingsCache settings;
    private final ObjectMapper objectMapper;

    public GeoPolicyController(SettingsCache settings, ObjectMapper objectMapper) {
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    public GeoPolicyResponse geo() {
        JsonNode stored = storedGeo();
        if (stored == null) {
            return new GeoPolicyResponse(null, Map.of(), List.of());
        }
        JsonNode enforce = stored.get("enforceCityLimit");
        return new GeoPolicyResponse(
                enforce != null && enforce.isBoolean() ? enforce.booleanValue() : null,
                cities(stored.get("cities")),
                blacklist(stored.get("blacklist")));
    }

    private JsonNode storedGeo() {
        return settings.value(GEO_KEY).map(row -> {
            JsonNode parsed;
            try {
                parsed = objectMapper.readTree(row);
            } catch (RuntimeException e) {
                log.warn("settings.{} is not parseable JSON; serving the built-in geo policy",
                        GEO_KEY, e);
                return null;
            }
            if (!parsed.isObject()) {
                log.warn("settings.{} is not a JSON object; serving the built-in geo policy",
                        GEO_KEY);
                return null;
            }
            return parsed;
        }).orElse(null);
    }

    private static Map<String, GeoPolicyResponse.CityGeo> cities(JsonNode node) {
        Map<String, GeoPolicyResponse.CityGeo> out = new LinkedHashMap<>();
        if (node == null || !node.isObject()) {
            return out;
        }
        node.properties().forEach(entry -> {
            JsonNode city = entry.getValue();
            if (city == null || !city.isObject()) {
                return;
            }
            GeoPolicyResponse.CityGeo projected = new GeoPolicyResponse.CityGeo(
                    latLng(city.get("center")),
                    bounds(city.get("bounds")));
            if (projected.center() != null || projected.bounds() != null) {
                out.put(entry.getKey(), projected);
            }
        });
        return out;
    }

    private static GeoPolicyResponse.LatLng latLng(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        Double lat = coordinate(node.get("lat"), MAX_LATITUDE);
        Double lng = coordinate(node.get("lng"), MAX_LONGITUDE);
        if (lat == null || lng == null) {
            return null;
        }
        return new GeoPolicyResponse.LatLng(lat, lng);
    }

    private static GeoPolicyResponse.Bounds bounds(JsonNode node) {
        if (node == null || !node.isObject()) {
            return null;
        }
        Double north = coordinate(node.get("north"), MAX_LATITUDE);
        Double south = coordinate(node.get("south"), MAX_LATITUDE);
        Double east = coordinate(node.get("east"), MAX_LONGITUDE);
        Double west = coordinate(node.get("west"), MAX_LONGITUDE);
        if (north == null || south == null || east == null || west == null) {
            return null;
        }
        if (north <= south || east <= west) {
            return null;
        }
        return new GeoPolicyResponse.Bounds(north, south, east, west);
    }

    private static Double coordinate(JsonNode node, double limit) {
        if (node == null || !node.isNumber()) {
            return null;
        }
        double value = node.doubleValue();
        if (!Double.isFinite(value) || Math.abs(value) > limit) {
            return null;
        }
        return value;
    }

    private static List<GeoPolicyResponse.BlacklistEntry> blacklist(JsonNode node) {
        List<GeoPolicyResponse.BlacklistEntry> out = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return out;
        }
        for (JsonNode entry : node) {
            if (entry == null || !entry.isObject()) {
                continue;
            }
            String placeId = text(entry.get("placeId"));
            String term = text(entry.get("term"));
            if (term != null && term.length() < MIN_BLACKLIST_TERM) {
                term = null;
            }
            if (placeId == null && term == null) {
                continue;
            }
            out.add(new GeoPolicyResponse.BlacklistEntry(text(entry.get("id")), placeId, term));
        }
        return out;
    }

    private static String text(JsonNode node) {
        if (node == null || !node.isString()) {
            return null;
        }
        String value = node.stringValue().trim();
        return value.isEmpty() ? null : value;
    }
}
