package com.draazy.api.common.settings;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class AppFlagsController {
    private static final Logger log = LoggerFactory.getLogger(AppFlagsController.class);

    private static final String FLAGS_KEY = PlatformSettings.FLAGS_KEY;

    static final Set<String> PUBLIC = Set.of("mapSearch", "scheduleVisit", "reviewsEnabled", "inAppMessaging",
            "assistant", "kycBadgeEnabled", "subscriptionPlans", "referralRewards",
            "signupsEnabled", "maintenanceMode");

    private final SettingsCache settings;
    private final ObjectMapper objectMapper;

    public AppFlagsController(SettingsCache settings, ObjectMapper objectMapper) {
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    public Map<String, Boolean> flags() {
        Map<String, Boolean> out = new LinkedHashMap<>();
        settings.value(FLAGS_KEY).ifPresent(row -> {
            JsonNode parsed;
            try {
                parsed = objectMapper.readTree(row);
            } catch (RuntimeException e) {
                log.warn("settings.{} is not parseable JSON; serving no flags", FLAGS_KEY, e);
                return;
            }
            if (!parsed.isObject()) {
                log.warn("settings.{} is not a JSON object; serving no flags", FLAGS_KEY);
                return;
            }
            parsed.properties().forEach(entry -> {
                if (PUBLIC.contains(entry.getKey()) && entry.getValue().isBoolean()) {
                    out.put(entry.getKey(), entry.getValue().booleanValue());
                }
            });
        });
        return out;
    }
}
