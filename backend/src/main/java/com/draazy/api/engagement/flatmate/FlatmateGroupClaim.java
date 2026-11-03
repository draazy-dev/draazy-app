package com.draazy.api.engagement.flatmate;

import java.util.List;
import java.util.function.UnaryOperator;

record FlatmateGroupClaim(FlatmateGroupPreferences preferences) {

    static FlatmateGroupClaim of(FlatmateGroupCreateRequest body,
            UnaryOperator<List<String>> canonicalLocalities) {
        FlatmateGroupPreferences normal = body.preferences().normalised();
        return new FlatmateGroupClaim(normal.withLocalities(canonicalLocalities.apply(normal.localities())));
    }

    String locality() {
        return preferences.localities().get(0);
    }

    Long rent() {
        return preferences.rentMax();
    }

    void shape(FlatmateGroup group) {
        group.hunt(preferences);
    }
}
