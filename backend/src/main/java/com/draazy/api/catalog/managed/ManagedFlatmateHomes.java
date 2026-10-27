package com.draazy.api.catalog.managed;

import com.draazy.api.catalog.locality.LocalityBinding;
import com.draazy.api.common.web.Ids;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Savepoint;
import javax.sql.DataSource;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The private home an owner gets when they confirm a tenant's flatmate room in it. Facts arrive as plain values so
 * this context never learns what a room is. */
@Service
public class ManagedFlatmateHomes {

    /** What the room says about the flat; every field may be blank except the fingerprint and locality. */
    public record Facts(UUID roomId, String fingerprint, String homeTypeLabel, String bhk, String locality,
            String society, String furnishing) {
    }

    private static final Pattern LEADING_NUMBER = Pattern.compile("^\\s*(\\d+)");

    private static final String INSERT = """
            insert into managed_properties (owner_id, title, deal, property_type, bhk, price, locality,
                                            locality_slug, society, furnishing, source_room_id, address_fingerprint)
            values (?, ?, 'rent', ?, cast(? as numeric), 0, ?, cast(? as text), cast(? as text), cast(? as text),
                    ?, ?)
            on conflict (owner_id, address_fingerprint) where address_fingerprint is not null do nothing
            """;

    private final ManagedPropertyRepository records;
    private final LocalityBinding localities;
    private final DataSource dataSource;
    private final JdbcTemplate jdbc;

    public ManagedFlatmateHomes(ManagedPropertyRepository records, LocalityBinding localities,
            DataSource dataSource) {
        this.records = records;
        this.localities = localities;
        this.dataSource = dataSource;
        this.jdbc = new JdbcTemplate(dataSource);
    }

    /** Joins the caller's transaction to see its uncommitted rows; a database error rolls back to a savepoint, and goes
     * through JDBC because a failed Hibernate statement would mark that transaction rollback-only. */
    @Transactional(noRollbackFor = DataAccessException.class)
    public boolean register(UUID ownerId, Facts facts) {
        String society = blankToNull(facts.society());
        String label = blankToNull(facts.homeTypeLabel());
        BigDecimal bhk = bhkOf(facts.bhk());
        String title = ManagedPropertyService.synthTitle(bhk, label == null ? "Flat" : label,
                society == null ? facts.locality() : society);
        String slug = localities.slugOrNull(null, facts.locality());
        Connection con = DataSourceUtils.getConnection(dataSource);
        try {
            Savepoint savepoint = con.setSavepoint();
            try {
                return jdbc.update(INSERT, ownerId, title, propertyTypeOf(label), bhk, facts.locality(), slug,
                        society, furnishingOf(facts.furnishing()), facts.roomId(), facts.fingerprint()) > 0;
            } catch (DataAccessException e) {
                con.rollback(savepoint);
                throw e;
            }
        } catch (SQLException e) {
            throw new CannotGetJdbcConnectionException("Could not manage the home insert savepoint", e);
        } finally {
            DataSourceUtils.releaseConnection(con, dataSource);
        }
    }

    @Transactional(readOnly = true)
    public boolean exists(UUID ownerId, String fingerprint) {
        return records.existsByOwnerIdAndAddressFingerprint(ownerId, fingerprint);
    }

    @Transactional(readOnly = true)
    public List<ManagedProperty> homesOf(UUID ownerId) {
        return records.findByOwnerIdAndAddressFingerprintNotNullOrderByCreatedAtDescIdDesc(ownerId);
    }

    @Transactional(readOnly = true)
    public Optional<ManagedProperty> homeOf(UUID ownerId, String managedId) {
        return Ids.parseUuid(managedId).flatMap(records::findById)
                .filter(m -> m.getOwnerId().equals(ownerId) && m.getAddressFingerprint() != null);
    }

    // The wizard's HOME_TYPE_PILLS: Row House shares "independent" with Independent House.
    static String propertyTypeOf(String homeTypeLabel) {
        String label = homeTypeLabel == null ? "" : homeTypeLabel.strip().toLowerCase(Locale.ROOT);
        return switch (label) {
            case "independent house", "row house" -> "independent";
            case "villa" -> "villa";
            default -> "flat";
        };
    }

    // A flatmate post says "semi"; the catalogue says "semi-furnished".
    static String furnishingOf(String roomFurnishing) {
        if (roomFurnishing == null) {
            return null;
        }
        return switch (roomFurnishing.strip().toLowerCase(Locale.ROOT)) {
            case "unfurnished" -> "unfurnished";
            case "semi" -> "semi-furnished";
            case "furnished" -> "furnished";
            default -> null;
        };
    }

    static BigDecimal bhkOf(String roomBhk) {
        Matcher leading = LEADING_NUMBER.matcher(roomBhk == null ? "" : roomBhk);
        return leading.find() ? new BigDecimal(leading.group(1)) : null;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.strip();
    }
}
