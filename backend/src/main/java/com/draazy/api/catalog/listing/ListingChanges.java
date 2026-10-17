package com.draazy.api.catalog.listing;

import com.draazy.api.catalog.property.Property;
import java.math.BigDecimal;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import org.springframework.beans.BeanWrapper;
import org.springframework.beans.PropertyAccessorFactory;

/** Before/after of the listing fields an edit is allowed to touch, as strings safe for the audit metadata. */
final class ListingChanges {

    private ListingChanges() {
    }

    static Map<String, String> snapshot(Property p) {
        BeanWrapper bean = PropertyAccessorFactory.forBeanPropertyAccess(p);
        Map<String, String> values = new LinkedHashMap<>();
        for (var component : ListingUpdate.class.getRecordComponents()) {
            String name = component.getName();
            if (bean.isReadableProperty(name)) {
                values.put(name, render(bean.getPropertyValue(name)));
            }
        }
        return values;
    }

    // Scale and key order are storage noise, so equal values must render equal.
    static String render(Object value) {
        if (value instanceof BigDecimal number) {
            return number.signum() == 0 ? "0" : number.stripTrailingZeros().toPlainString();
        }
        if (value instanceof Map<?, ?> map) {
            Map<String, String> sorted = new TreeMap<>();
            map.forEach((k, v) -> sorted.put(String.valueOf(k), render(v)));
            return sorted.toString();
        }
        if (value instanceof Collection<?> items) {
            return items.stream().map(ListingChanges::render).toList().toString();
        }
        return String.valueOf(value);
    }

    static Map<String, Map<String, String>> diff(Map<String, String> before, Map<String, String> after) {
        Map<String, Map<String, String>> changes = new LinkedHashMap<>();
        before.forEach((field, old) -> {
            String now = after.get(field);
            if (!old.equals(now)) {
                changes.put(field, Map.of("before", old, "after", String.valueOf(now)));
            }
        });
        return changes;
    }
}
