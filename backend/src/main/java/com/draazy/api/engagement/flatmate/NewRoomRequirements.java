package com.draazy.api.engagement.flatmate;

import com.draazy.api.common.error.ValidationException;
import java.util.ArrayList;
import java.util.List;

/** What a new room must answer. Edits are exempt so rooms posted before this rule stay correctable. */
final class NewRoomRequirements {

    static final int MIN_PHOTOS = 3;

    private NewRoomRequirements() {
    }

    static void check(FlatmateRoomCreateRequest body) {
        FlatmateRoomDetails details = body.details();
        List<String> missing = new ArrayList<>();
        requireText(body.homeTypeLabel(), "home type", missing);
        requireText(body.bhk(), "BHK", missing);
        requireText(body.attachedBath(), "washroom", missing);
        requireText(body.furnishing(), "furnishing", missing);
        requireText(body.flatNumber(), "flat / house number", missing);
        requireValue(details == null ? null : details.bathrooms(), "bathrooms", missing);
        if ("Flat".equals(body.homeTypeLabel())) {
            requireText(details == null ? null : details.floor(), "floor", missing);
            requireValue(details == null ? null : details.totalFloors(), "total floors", missing);
        } else if (body.homeTypeLabel() != null && !body.homeTypeLabel().isBlank()) {
            requireValue(details == null ? null : details.floorsInHouse(), "floors in the house", missing);
        }
        requireValue(body.noticePeriodDays(), "notice period", missing);
        requireValue(body.lockInMonths(), "lock-in", missing);
        if (!missing.isEmpty()) {
            throw new ValidationException("A new room needs: " + String.join(", ", missing) + ".");
        }
        if (body.photos() == null || body.photos().size() < MIN_PHOTOS) {
            throw new ValidationException("A new room needs at least " + MIN_PHOTOS + " photos.");
        }
    }

    private static void requireText(String value, String label, List<String> missing) {
        if (value == null || value.isBlank()) {
            missing.add(label);
        }
    }

    private static void requireValue(Integer value, String label, List<String> missing) {
        if (value == null) {
            missing.add(label);
        }
    }
}
