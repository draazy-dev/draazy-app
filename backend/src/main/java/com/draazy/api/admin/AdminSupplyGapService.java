package com.draazy.api.admin;

import com.draazy.api.catalog.locality.LocalityRepository;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.error.BadRequestException;
import com.draazy.api.engagement.demand.DemandSignalRepository;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AdminSupplyGapService {
    private static final int DEFAULT_WINDOW_DAYS = 30;

    private static final int MAX_WINDOW_DAYS = 365;

    private static final int WEIGHT_SEARCH = 2;
    private static final int WEIGHT_ALERT = 5;

    private final DemandSignalRepository demand;
    private final PropertyRepository properties;
    private final LocalityRepository localities;

    public AdminSupplyGapService(DemandSignalRepository demand,
                                 PropertyRepository properties,
                                 LocalityRepository localities) {
        this.demand = demand;
        this.properties = properties;
        this.localities = localities;
    }

    @Transactional(readOnly = true)
    public List<SupplyGapRow> report(Integer days) {
        int window = days == null ? DEFAULT_WINDOW_DAYS : days;
        if (window < 1 || window > MAX_WINDOW_DAYS) {
            throw new BadRequestException("days must be between 1 and " + MAX_WINDOW_DAYS);
        }
        Instant since = Instant.now().minus(window, ChronoUnit.DAYS);

        Map<String, Long> supply = new HashMap<>();
        for (Object[] row : properties.countLiveByLocalitySlug("approved")) {
            supply.put((String) row[0], ((Number) row[1]).longValue());
        }

        Map<String, DemandSignalRepository.DemandByLocality> byLocality = new HashMap<>();
        DemandSignalRepository.DemandByLocality unplaced = null;
        for (DemandSignalRepository.DemandByLocality row : demand.aggregateSince(since)) {
            if (row.getLocalitySlug() == null) {
                unplaced = row;
            } else {
                byLocality.put(row.getLocalitySlug(), row);
            }
        }

        Set<String> slugs = new LinkedHashSet<>(supply.keySet());
        slugs.addAll(byLocality.keySet());

        Map<String, String> names = new HashMap<>();
        localities.findAllById(slugs).forEach(l -> names.put(l.getSlug(), l.getName()));

        Map<String, Long> seekers = new HashMap<>();
        demand.repeatSeekersSince(since)
                .forEach(r -> seekers.put(r.getLocalitySlug(), r.getSeekers()));

        List<SupplyGapRow> rows = new ArrayList<>(slugs.size() + 1);
        for (String slug : slugs) {
            rows.add(row(slug, names.get(slug), supply.getOrDefault(slug, 0L),
                    byLocality.get(slug), seekers.getOrDefault(slug, 0L)));
        }
        rows.sort(Comparator.comparingDouble(SupplyGapRow::demandPerListing)
                .thenComparingLong(SupplyGapRow::demand)
                .reversed());
        if (unplaced != null) {
            rows.add(row(null, null, 0L, unplaced, 0L));
        }
        return rows;
    }

    private static SupplyGapRow row(String slug, String name, long supply,
                                    DemandSignalRepository.DemandByLocality d, long repeatSeekers) {
        long searches = d == null ? 0 : d.getSearches();
        long alerts = d == null ? 0 : d.getAlerts();
        long views = d == null ? 0 : d.getViews();
        long weighted = searches * WEIGHT_SEARCH + alerts * WEIGHT_ALERT;
        double perListing = Math.round(weighted * 10.0 / (supply + 1)) / 10.0;
        return new SupplyGapRow(slug, name, supply, searches, alerts, views, repeatSeekers,
                weighted, perListing);
    }
}
