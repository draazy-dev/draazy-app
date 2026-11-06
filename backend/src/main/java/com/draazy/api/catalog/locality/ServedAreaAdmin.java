package com.draazy.api.catalog.locality;

import com.draazy.api.common.audit.AuditService;
import com.draazy.api.common.error.ServiceUnavailableException;
import com.draazy.api.common.settings.GeoPolicyController;
import com.draazy.api.provider.PlacesLookup;
import com.draazy.api.provider.PlacesLookup.Place;
import com.draazy.api.security.AuthPrincipal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ServedAreaAdmin {
    static final int RECHECK_BATCH = 50;

    private static final int MAX_OUTSIDE_ROWS = 200;

    private static final Logger log = LoggerFactory.getLogger(ServedAreaAdmin.class);

    private static final String LIVE_LOCALITY = "archived_at is null";

    private static final String LIVE_SOCIETY = "archived_at is null and merged_into is null";

    private static final String UNCHECKED = " and place_id is not null and district_checked_at is null";

    private static final String OUTSIDE_FILTER =
            " and district_checked_at is not null and (district is null or lower(btrim(district)) <> all (?))";

    private static final String OUTSIDE = "select * from ("
            + "select 'locality' as kind, slug, name, district, lat, lng from localities where " + LIVE_LOCALITY
            + OUTSIDE_FILTER
            + " union all select 'society', slug, name, district, lat, lng from societies where " + LIVE_SOCIETY
            + OUTSIDE_FILTER
            + ") u order by kind, name limit " + MAX_OUTSIDE_ROWS;

    private static final String UNCHECKED_COUNT = "select (select count(*) from localities where " + LIVE_LOCALITY
            + UNCHECKED + ") + (select count(*) from societies where " + LIVE_SOCIETY + UNCHECKED + ")";

    private static final String UNCHECKED_BATCH = "select * from ("
            + "select 'locality' as kind, slug, place_id, name, lat, lng from localities where " + LIVE_LOCALITY
            + UNCHECKED
            + " union all select 'society', slug, place_id, name, lat, lng from societies where " + LIVE_SOCIETY
            + UNCHECKED
            + ") u order by kind, slug limit ?";

    private static final String STAMP = " set district = ?, district_checked_at = now() where slug = ? and place_id = ?";

    private static final String STAMP_LOCALITY = "update localities" + STAMP;

    private static final String STAMP_SOCIETY = "update societies" + STAMP;

    private final JdbcTemplate jdbc;
    private final PlacesLookup places;
    private final GeoPolicyController geo;
    private final AuditService audit;

    public ServedAreaAdmin(JdbcTemplate jdbc, PlacesLookup places, GeoPolicyController geo, AuditService audit) {
        this.jdbc = jdbc;
        this.places = places;
        this.geo = geo;
        this.audit = audit;
    }

    public ServedAreaReport report() {
        List<String> served = geo.servedDistricts();
        String[] lowered = served.stream().map(d -> d.toLowerCase(Locale.ROOT)).toArray(String[]::new);
        List<ServedAreaReport.Row> outside = jdbc.query(OUTSIDE, (rs, n) -> new ServedAreaReport.Row(
                rs.getString("kind"), rs.getString("slug"), rs.getString("name"), rs.getString("district"),
                nullable(rs, "lat"), nullable(rs, "lng")), lowered, lowered);
        return new ServedAreaReport(served, outside, unchecked());
    }

    public ServedAreaReport.Recheck recheck(AuthPrincipal actor) {
        List<Pending> batch = jdbc.query(UNCHECKED_BATCH, (rs, n) -> new Pending(rs.getString("kind"),
                rs.getString("slug"), rs.getString("place_id"), rs.getString("name"),
                nullable(rs, "lat"), nullable(rs, "lng")), RECHECK_BATCH);
        int checked = 0;
        for (Pending row : batch) {
            String district;
            try {
                district = places.details(row.placeId(), row.hint()).map(Place::district).orElse(null);
            } catch (PlacesLookup.UnavailableException e) {
                log.warn("Places lookup unavailable during served-area recheck: {}", e.getMessage());
                if (checked == 0) {
                    throw new ServiceUnavailableException("Google Places is unavailable. Try again later.");
                }
                break;
            }
            checked += "locality".equals(row.kind())
                    ? jdbc.update(STAMP_LOCALITY, district, row.slug(), row.placeId())
                    : jdbc.update(STAMP_SOCIETY, district, row.slug(), row.placeId());
        }
        audit.record(actor, "servedArea.recheck", "settings", "geo", "checked", checked);
        return new ServedAreaReport.Recheck(checked, unchecked());
    }

    private int unchecked() {
        Integer n = jdbc.queryForObject(UNCHECKED_COUNT, Integer.class);
        return n == null ? 0 : n;
    }

    private static Double nullable(ResultSet rs, String column) throws SQLException {
        double v = rs.getDouble(column);
        return rs.wasNull() ? null : v;
    }

    private record Pending(String kind, String slug, String placeId, String name, Double lat, Double lng) {
        Place hint() {
            return new Place(placeId, name, lat, lng, null, List.of(), null);
        }
    }
}
