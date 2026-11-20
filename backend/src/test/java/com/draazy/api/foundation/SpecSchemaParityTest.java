package com.draazy.api.foundation;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.draazy.api.catalog.property.PropertySearchResponse;
import com.draazy.api.common.web.PageResponse;
import java.io.InputStream;
import java.lang.reflect.ParameterizedType;
import java.lang.reflect.RecordComponent;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.ResponseEntity;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;
import org.yaml.snakeyaml.Yaml;

@SpringBootTest
@AutoConfigureMockMvc
@DisplayName("The contract — declared response fields match what the handlers actually return")
class SpecSchemaParityTest {
    private static final int COMPARABLE_FLOOR = 60;

    private static final List<String> NOT_OURS = List.of("/error", "/actuator");

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    RequestMappingHandlerMapping handlers;

    @Test
    @DisplayName("no declared response field is absent from the type the handler returns")
    void declaredFieldsExist() {
        List<String> drift = new ArrayList<>();
        for (Comparison c : comparisons()) {
            Set<String> missing = new TreeSet<>(c.declared());
            missing.removeAll(c.served());
            if (!missing.isEmpty()) {
                drift.add("%s -> %s declares %s, absent from %s"
                        .formatted(c.operation(), c.schemaName(), missing, c.typeName()));
            }
        }
        assertThat(drift)
                .as("the contract promises fields the handler does not return — a generated client "
                        + "would compile against them and get null. Fix the DTO, or correct the "
                        + "contract")
                .isEmpty();
    }

    @Test
    @DisplayName("no returned field is missing from the contract")
    void servedFieldsAreDeclared() {
        List<String> drift = new ArrayList<>();
        for (Comparison c : comparisons()) {
            Set<String> undeclared = new TreeSet<>(c.served());
            undeclared.removeAll(c.declared());
            if (!undeclared.isEmpty()) {
                drift.add("%s -> %s returns %s, absent from schema %s"
                        .formatted(c.operation(), c.typeName(), undeclared, c.schemaName()));
            }
        }
        assertThat(drift)
                .as("fields are on the wire that the contract does not mention — undocumented "
                        + "surface, and the usual way a field meant to stay internal reaches a "
                        + "client")
                .isEmpty();
    }

    @Test
    @DisplayName("the comparison covers at least as many operations as it used to")
    void coverageOnlyGrows() {
        assertThat(comparisons().size())
                .as("operations whose response shape is resolvable on both sides. If this fell, the "
                        + "other two tests just got weaker without failing — that is the point of "
                        + "the floor")
                .isGreaterThanOrEqualTo(COMPARABLE_FLOOR);
    }

    private record Comparison(
            String operation, String schemaName, String typeName, Set<String> declared, Set<String> served) {}

    private List<Comparison> comparisons() {
        Map<String, Object> spec = loadSpec();
        List<Comparison> out = new ArrayList<>();
        handlers.getHandlerMethods().forEach((info, handler) -> {
            var patterns = info.getPathPatternsCondition();
            if (patterns == null) {
                return;
            }
            for (String pattern : patterns.getPatternValues()) {
                if (NOT_OURS.stream().anyMatch(pattern::startsWith)) {
                    continue;
                }
                for (var method : info.getMethodsCondition().getMethods()) {
                    compare(spec, method.name(), pattern, handler).ifPresent(out::add);
                }
            }
        });
        return out;
    }

    private Optional<Comparison> compare(
            Map<String, Object> spec, String verb, String pattern, HandlerMethod handler) {
        Map<String, Object> operation = findOperation(spec, verb, pattern);
        if (operation == null) {
            return Optional.empty();
        }
        Named leaf = leafSchema(spec, successSchema(operation), null);
        if (leaf == null || leaf.schema().get("properties") == null) {
            return Optional.empty();
        }
        Class<?> type = leafType(handler.getMethod().getGenericReturnType());
        if (type == null || !type.isRecord()) {
            return Optional.empty();
        }

        @SuppressWarnings("unchecked")
        Set<String> declared = new TreeSet<>(((Map<String, Object>) leaf.schema().get("properties")).keySet());
        Set<String> served = new TreeSet<String>();
        for (var component : type.getRecordComponents()) {
            if (suppressedFromJson(component)) {
                continue;
            }
            served.add(component.getName());
        }
        return Optional.of(new Comparison(
                verb + " " + pattern,
                leaf.name() == null ? "(inline)" : leaf.name(),
                type.getSimpleName(),
                declared,
                served));
    }

    private static boolean suppressedFromJson(RecordComponent component) {
        if (component.isAnnotationPresent(JsonIgnore.class)
                || component.getAccessor().isAnnotationPresent(JsonIgnore.class)) {
            return true;
        }
        try {
            return component.getDeclaringRecord()
                    .getDeclaredField(component.getName())
                    .isAnnotationPresent(JsonIgnore.class);
        } catch (NoSuchFieldException unreachable) {
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> successSchema(Map<String, Object> operation) {
        Map<String, Object> responses = (Map<String, Object>) operation.get("responses");
        if (responses == null) {
            return null;
        }
        for (String code : List.of("200", "201")) {
            Map<String, Object> response = (Map<String, Object>) responses.get(code);
            if (response == null) {
                continue;
            }
            Map<String, Object> content = (Map<String, Object>) response.get("content");
            if (content == null) {
                continue;
            }
            Map<String, Object> json = (Map<String, Object>) content.get("application/json");
            if (json != null) {
                return (Map<String, Object>) json.get("schema");
            }
        }
        return null;
    }

    private record Named(String name, Map<String, Object> schema) {}

    @SuppressWarnings("unchecked")
    private static Named leafSchema(Map<String, Object> spec, Map<String, Object> schema, String name) {
        if (schema == null) {
            return null;
        }
        if (schema.get("$ref") instanceof String ref) {
            String component = ref.substring(ref.lastIndexOf('/') + 1);
            return leafSchema(spec, deref(spec, component), component);
        }
        if (schema.get("allOf") instanceof List<?> members) {
            for (Object member : members) {
                Map<String, Object> properties = (Map<String, Object>) ((Map<String, Object>) member).get("properties");
                if (properties != null && properties.get("content") != null) {
                    return leafSchema(spec, (Map<String, Object>) properties.get("content"), name);
                }
            }
            return null;
        }
        if (schema.get("items") != null) {
            return leafSchema(spec, (Map<String, Object>) schema.get("items"), name);
        }
        return new Named(name, schema);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> deref(Map<String, Object> spec, String component) {
        Map<String, Object> components = (Map<String, Object>) spec.get("components");
        Map<String, Object> schemas = (Map<String, Object>) components.get("schemas");
        return (Map<String, Object>) schemas.get(component);
    }

    private static Class<?> leafType(Type type) {
        if (type instanceof ParameterizedType parameterized) {
            Class<?> raw = (Class<?>) parameterized.getRawType();
            boolean wrapper = raw == ResponseEntity.class
                    || raw == PageResponse.class
                    || raw == PropertySearchResponse.class
                    || raw == Optional.class
                    || List.class.isAssignableFrom(raw);
            return wrapper ? leafType(parameterized.getActualTypeArguments()[0]) : raw;
        }
        return type instanceof Class<?> clazz ? clazz : null;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> findOperation(Map<String, Object> spec, String verb, String pattern) {
        Map<String, Map<String, Object>> paths = (Map<String, Map<String, Object>>) spec.get("paths");
        String wanted = erase(pattern);
        for (var entry : paths.entrySet()) {
            if (!erase(entry.getKey()).equals(wanted)) {
                continue;
            }
            for (var operation : entry.getValue().entrySet()) {
                if (operation.getKey().toUpperCase(Locale.ROOT).equals(verb)) {
                    return (Map<String, Object>) operation.getValue();
                }
            }
        }
        return null;
    }

    private static String erase(String path) {
        String erased = path.replaceAll("\\{[^}]+}", "{}");
        return erased.length() > 1 && erased.endsWith("/") ? erased.substring(0, erased.length() - 1) : erased;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadSpec() {
        try (InputStream in = getClass().getResourceAsStream("/static/openapi/draazy-api.yaml")) {
            assertThat(in).as("the contract must be on the classpath").isNotNull();
            return (Map<String, Object>) new Yaml().load(in);
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException("cannot read the contract", e);
        }
    }
}
