package com.draazy.api.common.settings;

import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public class MovePackController {
    private static final Logger log = LoggerFactory.getLogger(MovePackController.class);

    private static final String MOVE_PACK_KEY = "movePack";

    private static final String ENABLED_FIELD = "enabled";

    private static final String ITEMS_FIELD = "items";

    private static final MovePackResponse COMING_SOON = new MovePackResponse(false, Map.of());

    private final SettingsCache settings;
    private final ObjectMapper objectMapper;

    public MovePackController(SettingsCache settings, ObjectMapper objectMapper) {
        this.settings = settings;
        this.objectMapper = objectMapper;
    }

    public MovePackResponse movePack() {
        return settings.value(MOVE_PACK_KEY)
                .map(row -> {
                    JsonNode parsed;
                    try {
                        parsed = objectMapper.readTree(row);
                    } catch (RuntimeException e) {
                        log.warn("settings.{} is not parseable JSON; pack stays in coming-soon mode",
                                MOVE_PACK_KEY, e);
                        return COMING_SOON;
                    }
                    if (!parsed.isObject()) {
                        log.warn("settings.{} is not a JSON object; pack stays in coming-soon mode",
                                MOVE_PACK_KEY);
                        return COMING_SOON;
                    }
                    JsonNode enabled = parsed.get(ENABLED_FIELD);
                    return new MovePackResponse(
                            enabled != null && enabled.isBoolean() && enabled.booleanValue(),
                            prices(parsed.get(ITEMS_FIELD)));
                })
                .orElse(COMING_SOON);
    }

    private static Map<String, Integer> prices(JsonNode items) {
        Map<String, Integer> out = new LinkedHashMap<>();
        if (items == null || !items.isObject()) {
            return out;
        }
        items.properties().forEach(entry -> {
            JsonNode value = entry.getValue();
            if (value.isIntegralNumber() && value.canConvertToInt() && value.intValue() >= 0) {
                out.put(entry.getKey(), value.intValue());
            }
        });
        return out;
    }
}
