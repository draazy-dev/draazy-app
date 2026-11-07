package com.draazy.api.catalog.locality;

import java.util.List;

public record ServedAreaReport(List<String> servedDistricts, List<Row> outside, int outsideTotal, int unchecked) {
    public record Row(String kind, String slug, String name, String district, Double lat, Double lng) {
    }

    public record Recheck(int checked, int remaining) {
    }
}
