package com.draazy.api.catalog.locality;

import com.draazy.api.common.settings.GeoPolicyController;
import com.draazy.api.provider.PlacesLookup.Place;
import org.springframework.stereotype.Component;

@Component
public class ServedArea {
    private final GeoPolicyController geo;

    public ServedArea(GeoPolicyController geo) {
        this.geo = geo;
    }

    public boolean covers(Place place) {
        return covers(place.district());
    }

    public boolean covers(String district) {
        if (district == null || district.isBlank()) {
            return false;
        }
        String wanted = district.strip();
        return geo.servedDistricts().stream().anyMatch(wanted::equalsIgnoreCase);
    }
}
