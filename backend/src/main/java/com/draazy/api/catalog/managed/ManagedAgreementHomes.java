package com.draazy.api.catalog.managed;

import com.draazy.api.catalog.locality.LocalityBinding;
import com.draazy.api.common.trust.Notifier;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class ManagedAgreementHomes {
    public static final String AGREEMENT_CATEGORY = "Rent Agreement";

    public record Lease(UUID ownerId, UUID listingId, String flatKey, String title, String homeTypeLabel,
            BigDecimal bhk, String locality, String society, BigDecimal area, String areaUnit, String tenantName,
            String tenantMobile, long monthlyRent, int dueDay, LocalDate leaseEnd, Long deposit,
            UUID agreementRequestId) {
    }

    public record Paper(String fileName, String storageKey, Long sizeBytes, String mimeType) {
    }

    private static final String FIND = """
            select id from managed_properties
             where owner_id = ? and (published_listing_id = cast(? as uuid) or agreement_flat_key = cast(? as text))
             order by (published_listing_id = cast(? as uuid)) desc nulls last, created_at
             limit 1
               for update
            """;

    // tenant_since compares against the row's old tenant_mobile: SET expressions read pre-update values.
    private static final String UPDATE = """
            update managed_properties
               set rented = true, deal = 'rent', tenant_name = cast(? as text), tenant_mobile = cast(? as text),
                   tenant_since = case when tenant_mobile is distinct from cast(? as text) or tenant_since is null
                                       then now() else tenant_since end,
                   monthly_rent = ?, price = ?, due_day = ?,
                   renewal_reminded_at = case when lease_end is distinct from cast(? as date)
                                              then null else renewal_reminded_at end,
                   lease_end = cast(? as date),
                   deposit = cast(? as bigint),
                   agreement_request_id = cast(? as uuid),
                   published_listing_id = coalesce(published_listing_id, cast(? as uuid)),
                   agreement_flat_key = coalesce(agreement_flat_key, cast(? as text))
             where id = ?
            """;

    private static final String INSERT = """
            insert into managed_properties (owner_id, title, deal, property_type, bhk, price, locality,
                                            locality_slug, society, area, area_unit, rented, tenant_name,
                                            tenant_mobile, tenant_since, monthly_rent, due_day, lease_end,
                                            deposit, agreement_request_id, published_listing_id, agreement_flat_key)
            values (?, ?, 'rent', ?, cast(? as numeric), ?, ?, cast(? as text), cast(? as text),
                    cast(? as numeric), ?, true, cast(? as text), cast(? as text), now(), ?, ?, cast(? as date),
                    cast(? as bigint), cast(? as uuid), cast(? as uuid), cast(? as text))
            returning id
            """;

    private static final String PAPER = """
            insert into managed_property_documents (managed_property_id, category, file_name, storage_key,
                                                    size_bytes, mime_type)
            values (?, ?, cast(? as text), ?, cast(? as bigint), cast(? as text))
            """;

    private final ManagedPropertyRepository records;
    private final TrackedRentService trackedRent;
    private final LocalityBinding localities;
    private final Notifier notifier;
    private final EntityManager entityManager;
    private final JdbcTemplate jdbc;

    public ManagedAgreementHomes(ManagedPropertyRepository records, TrackedRentService trackedRent,
            LocalityBinding localities, Notifier notifier, EntityManager entityManager, DataSource dataSource) {
        this.records = records;
        this.trackedRent = trackedRent;
        this.localities = localities;
        this.notifier = notifier;
        this.entityManager = entityManager;
        this.jdbc = new JdbcTemplate(dataSource);
    }

    // Plain JDBC: the caller wraps it in a savepoint so a failure cannot doom the completing transaction.
    // The flush lets these statements see rows JPA has not written yet.
    public UUID record(Lease lease, Paper paper) {
        entityManager.flush();
        List<UUID> existing = jdbc.queryForList(FIND, UUID.class, lease.ownerId(), lease.listingId(),
                lease.flatKey(), lease.listingId());
        UUID id;
        if (existing.isEmpty()) {
            id = jdbc.queryForObject(INSERT, UUID.class, lease.ownerId(), titleOf(lease),
                    ManagedFlatmateHomes.propertyTypeOf(typeWord(lease.homeTypeLabel())), lease.bhk(),
                    lease.monthlyRent(), lease.locality(), localities.slugOrNull(null, lease.locality()),
                    lease.society(), lease.area(), lease.areaUnit(), lease.tenantName(), lease.tenantMobile(),
                    lease.monthlyRent(), lease.dueDay(), lease.leaseEnd(), lease.deposit(),
                    lease.agreementRequestId(), lease.listingId(), lease.flatKey());
        } else {
            id = existing.getFirst();
            jdbc.update(UPDATE, lease.tenantName(), lease.tenantMobile(), lease.tenantMobile(), lease.monthlyRent(),
                    lease.monthlyRent(), lease.dueDay(), lease.leaseEnd(), lease.leaseEnd(), lease.deposit(),
                    lease.agreementRequestId(), lease.listingId(), lease.flatKey(), id);
        }
        if (paper != null) {
            jdbc.update(PAPER, id, AGREEMENT_CATEGORY, paper.fileName(), paper.storageKey(), paper.sizeBytes(),
                    paper.mimeType());
        }
        return id;
    }

    public void announce(UUID id) {
        records.findById(id).ifPresent(m -> {
            entityManager.refresh(m);
            trackedRent.announceTenant(m);
            notifier.notify(m.getOwnerId(), TrackedRentService.TRACKING, "Your rented home is on Draazy",
                    m.getTitle() + " now tracks rent, the tenant and the registered agreement in one place.",
                    "/owner-hub/property/" + m.getId());
        });
    }

    private static String titleOf(Lease lease) {
        if (lease.title() != null) {
            return lease.title();
        }
        return ManagedPropertyService.synthTitle(lease.bhk(), typeWord(lease.homeTypeLabel()),
                lease.society() == null ? lease.locality() : lease.society());
    }

    private static String typeWord(String label) {
        return label == null ? "Flat" : label.split("/")[0].strip();
    }
}
