package com.draazy.api.catalog.managed;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

// A claim made before tenantSince was the previous tenant's, so every read and write is scoped by it.
@Component
class RentClaims {
    private static final String CLAIM = """
            insert into managed_property_rent_claims (managed_property_id, rent_month, created_at)
            values (?, ?, clock_timestamp())
            on conflict (managed_property_id, rent_month) do update set created_at = clock_timestamp()
             where managed_property_rent_claims.created_at < ?
            """;

    private static final String CLAIMED = """
            select exists (select 1 from managed_property_rent_claims
                            where managed_property_id = ? and rent_month = ? and created_at >= ?)
            """;

    private static final String PENDING = """
            select c.rent_month from managed_property_rent_claims c
             where c.managed_property_id = ? and c.created_at >= ?
               and not exists (select 1 from managed_property_rent_receipts r
                                where r.managed_property_id = c.managed_property_id and r.rent_month = c.rent_month)
             order by c.rent_month desc
            """;

    private final JdbcTemplate jdbc;

    RentClaims(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    boolean add(ManagedProperty m, YearMonth month) {
        return jdbc.update(CLAIM, m.getId(), month.toString(), since(m)) > 0;
    }

    boolean remove(ManagedProperty m, String month) {
        return jdbc.update("delete from managed_property_rent_claims where managed_property_id = ? and rent_month = ?"
                + " and created_at >= ?", m.getId(), month, since(m)) > 0;
    }

    boolean claimed(ManagedProperty m, YearMonth month) {
        return m.getTenantSince() != null && Boolean.TRUE.equals(
                jdbc.queryForObject(CLAIMED, Boolean.class, m.getId(), month.toString(), since(m)));
    }

    List<String> pending(ManagedProperty m) {
        if (!m.isRented() || m.getTenantSince() == null) {
            return List.of();
        }
        return jdbc.queryForList(PENDING, String.class, m.getId(), since(m));
    }

    private static Timestamp since(ManagedProperty m) {
        return Timestamp.from(m.getTenantSince() == null ? Instant.EPOCH : m.getTenantSince());
    }
}
