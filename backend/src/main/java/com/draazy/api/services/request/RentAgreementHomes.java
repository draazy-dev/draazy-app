package com.draazy.api.services.request;

import com.draazy.api.catalog.managed.ManagedAgreementHomes;
import com.draazy.api.catalog.managed.ManagedProperty;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.common.persistence.Savepoints;
import com.draazy.api.documents.vault.DocumentRepository;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.stereotype.Component;

@Component
class RentAgreementHomes {
    private static final Logger log = LoggerFactory.getLogger(RentAgreementHomes.class);
    private static final int MAX_TERM_MONTHS = 120;
    private static final int LAST_DUE_DAY = 28;
    private static final long MAX_DEPOSIT = 100_000_000L;
    private static final int MAX_ADDRESS = 300;
    private static final int MAX_RENTALS_PER_TENANT = 50;

    private static final String RENTAL = """
            insert into tenant_rentals (tenant_id, address, monthly_rent, deposit, lease_start, lease_end)
            select ?, ?, ?, cast(? as bigint), ?, cast(? as date)
             where (select count(*) from tenant_rentals where tenant_id = ? and archived = false) < ?
            """;

    private record Terms(long rent, Long deposit, LocalDate start, LocalDate end) {
    }

    private record Seeded(UUID homeId, UUID ownerId, UUID listingId) {
    }

    private final ServiceRequestPartyRepository parties;
    private final RentAgreementOwnerSide ownerSide;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final DocumentRepository documents;
    private final ManagedAgreementHomes homes;
    private final RentAgreementBadges badges;
    private final DataSource dataSource;
    private final JdbcTemplate jdbc;

    RentAgreementHomes(ServiceRequestPartyRepository parties, RentAgreementOwnerSide ownerSide,
            PropertyRepository properties, UserRepository users, DocumentRepository documents,
            ManagedAgreementHomes homes, RentAgreementBadges badges, DataSource dataSource) {
        this.parties = parties;
        this.ownerSide = ownerSide;
        this.properties = properties;
        this.users = users;
        this.documents = documents;
        this.homes = homes;
        this.badges = badges;
        this.dataSource = dataSource;
        this.jdbc = new JdbcTemplate(dataSource);
    }

    // Best effort: a registered agreement must complete even if the dashboards cannot be seeded.
    void settle(ServiceRequest request, UUID finalDocumentId) {
        if (!ServiceRequestTypes.RENT_AGREEMENT.equals(request.getType())) {
            return;
        }
        Seeded seeded;
        try {
            seeded = seed(request, finalDocumentId);
        } catch (RuntimeException e) {
            log.warn("Could not seed dashboards for rent agreement {}", request.getId(), e);
            return;
        }
        if (seeded == null) {
            return;
        }
        isolated(request, "announce the managed home", seeded.homeId(), () -> homes.announce(seeded.homeId()));
        isolated(request, "badge the owner", seeded.ownerId(),
                () -> badges.verifyOwner(seeded.ownerId(), request.getId(), licensorName(request)));
        isolated(request, "badge the listing", seeded.listingId(),
                () -> badges.verifyListing(seeded.listingId(), seeded.ownerId(), request.getId()));
    }

    private static String licensorName(ServiceRequest request) {
        Map<String, Object> details = request.getDetails() == null ? Map.of() : request.getDetails();
        Object name = ServiceRequestPricing.childObject(
                ServiceRequestPricing.childObject(details, "_state"), "owner").get("oName");
        return name instanceof String s ? s : null;
    }

    private void isolated(ServiceRequest request, String step, UUID subject, Runnable work) {
        if (subject == null) {
            return;
        }
        try {
            Savepoints.isolated(dataSource, work);
        } catch (RuntimeException e) {
            log.warn("Could not {} for rent agreement {}", step, request.getId(), e);
        }
    }

    private Seeded seed(ServiceRequest request, UUID finalDocumentId) {
        Map<String, Object> details = request.getDetails() == null ? Map.of() : request.getDetails();
        Terms terms = termsOf(details);
        if (terms == null) {
            return null;
        }
        Property listing = request.getPropertyId() == null ? null
                : properties.findById(request.getPropertyId()).orElse(null);
        boolean requesterIsOwner = ownerSide.requesterIsOwner(request);
        List<ServiceRequestParty> joined = CoFillParties.joined(parties.findByRequestId(request.getId())).toList();
        Map<String, String> formTenants = RentAgreementRegistration.formTenants(request);
        List<User> tenants = tenantUsers(request, requesterIsOwner, joined, formTenants);
        UUID ownerId = ownerOf(request, requesterIsOwner, joined, details);
        tenants.removeIf(u -> u.getId().equals(ownerId));
        Map.Entry<String, String> primary = primaryTenant(tenants, formTenants);
        UUID homeId = null;
        Connection con = DataSourceUtils.getConnection(dataSource);
        try {
            Savepoint savepoint = con.setSavepoint();
            try {
                if (ownerId != null && primary != null) {
                    homeId = homes.record(lease(request, listing, ownerId, primary, terms), paper(finalDocumentId));
                }
                String address = addressOf(details, listing);
                tenants.forEach(t -> jdbc.update(RENTAL, t.getId(), address, terms.rent(), terms.deposit(),
                        terms.start(), terms.end(), t.getId(), MAX_RENTALS_PER_TENANT));
            } catch (RuntimeException e) {
                con.rollback(savepoint);
                homeId = null;
                log.warn("Could not seed dashboards for rent agreement {}", request.getId(), e);
            }
        } catch (SQLException e) {
            log.warn("Could not seed dashboards for rent agreement {}", request.getId(), e);
        } finally {
            DataSourceUtils.releaseConnection(con, dataSource);
        }
        UUID listingId = listing != null && ownerId != null && listing.getOwner().getId().equals(ownerId)
                ? listing.getId() : null;
        return new Seeded(homeId, ownerId, listingId);
    }

    private static Map.Entry<String, String> primaryTenant(List<User> tenants, Map<String, String> formTenants) {
        if (tenants.isEmpty()) {
            return formTenants.entrySet().stream().filter(e -> e.getKey() != null && e.getValue() != null)
                    .findFirst().orElse(null);
        }
        String mobile = RentAgreementRegistration.validMobile(tenants.getFirst().getMobile());
        String name = Stream.of(tenants.getFirst().getName(), formTenants.get(mobile))
                .filter(n -> n != null && !n.isBlank()).findFirst().orElse(null);
        return mobile == null || name == null ? null : Map.entry(mobile, name);
    }

    private static Terms termsOf(Map<String, Object> details) {
        Map<String, Object> terms = ServiceRequestPricing.childObject(
                ServiceRequestPricing.childObject(details, "_state"), "terms");
        Long rent = ServiceRequestPricing.rupees(details.get("rent"), terms.get("rent"));
        LocalDate start = RentAgreementRegistration.date(details.get("startDate"), terms.get("startDate"));
        if (rent == null || rent <= 0 || rent > ManagedProperty.MAX_MONTHLY_RENT || start == null) {
            return null;
        }
        Long deposit = ServiceRequestPricing.rupees(details.get("deposit"), terms.get("deposit"));
        Long months = ServiceRequestPricing.rupees(details.get("months"), terms.get("months"));
        return new Terms(rent, deposit == null || deposit < 0 || deposit > MAX_DEPOSIT ? null : deposit, start,
                months == null || months < 1 || months > MAX_TERM_MONTHS ? null : start.plusMonths(months));
    }

    // Typed tenant numbers count only when the owner raised the agreement: then each tenant
    // approved the draft by OTP on that number.
    private List<User> tenantUsers(ServiceRequest request, boolean requesterIsOwner,
            List<ServiceRequestParty> joined, Map<String, String> formTenants) {
        Stream<UUID> verified = Stream.concat(requesterIsOwner ? Stream.empty() : Stream.of(request.getRequesterId()),
                joined.stream().filter(p -> "tenant".equals(p.getRole())).map(ServiceRequestParty::getUserId));
        Stream<User> typed = requesterIsOwner ? formTenants.keySet().stream()
                .flatMap(m -> users.findByMobileAndArchivedFalse(m).stream()) : Stream.empty();
        return Stream.concat(verified.filter(Objects::nonNull).flatMap(id -> users.findById(id).stream()), typed)
                .collect(Collectors.toMap(User::getId, u -> u, (a, b) -> a, LinkedHashMap::new))
                .values().stream().collect(Collectors.toList());
    }

    // An owner typed on a tenant's form approved the draft by OTP on that number.
    private UUID ownerOf(ServiceRequest request, boolean requesterIsOwner, List<ServiceRequestParty> joined,
            Map<String, Object> details) {
        if (requesterIsOwner) {
            return request.getRequesterId();
        }
        UUID invited = joined.stream().filter(p -> "owner".equals(p.getRole()) && p.getPartyIndex() == 0)
                .map(ServiceRequestParty::getUserId).filter(Objects::nonNull).findFirst().orElse(null);
        if (invited != null) {
            return invited;
        }
        Map<String, Object> state = ServiceRequestPricing.childObject(details, "_state");
        String mobile = "invite".equals(state.get("ownerMode")) ? null : RentAgreementRegistration.validMobile(
                Objects.toString(ServiceRequestPricing.childObject(state, "owner").get("oMobile"), null));
        return mobile == null ? null : users.findByMobileAndArchivedFalse(mobile).map(User::getId).orElse(null);
    }

    private static ManagedAgreementHomes.Lease lease(ServiceRequest request, Property listing, UUID ownerId,
            Map.Entry<String, String> tenant, Terms terms) {
        Map<String, Object> details = request.getDetails() == null ? Map.of() : request.getDetails();
        Map<String, Object> prop = propOf(details);
        UUID listingId = listing != null && listing.getOwner().getId().equals(ownerId) ? listing.getId() : null;
        String society = listing != null && listing.getSocietyName() != null ? listing.getSocietyName()
                : text(prop.get("society"));
        String locality = listing != null ? listing.getLocality()
                : Stream.of(text(prop.get("locality")), text(prop.get("city"))).filter(Objects::nonNull)
                        .findFirst().orElse("Pune");
        String flatNo = text(prop.get("flatNo"));
        String title = listing != null ? listing.getTitle()
                : flatNo != null && society != null ? flatNo + ", " + society : null;
        BigDecimal area = listing != null ? listing.getArea() : number(prop.get("area"));
        String unit = listing != null ? listing.getAreaUnit()
                : "sqm".equals(prop.get("areaUnit")) ? "sqm" : "sqft";
        return new ManagedAgreementHomes.Lease(ownerId, listingId, RentAgreementOverlaps.flatKey(details), title,
                text(prop.get("propType")), listing == null ? null : listing.getBhk(), locality, society, area, unit,
                tenant.getValue(), tenant.getKey(), terms.rent(),
                Math.min(terms.start().getDayOfMonth(), LAST_DUE_DAY), terms.end(), terms.deposit(),
                request.getId());
    }

    private ManagedAgreementHomes.Paper paper(UUID documentId) {
        return documents.findById(documentId).map(d -> new ManagedAgreementHomes.Paper(d.getFileName(),
                d.getStorageKey(), d.getSizeBytes(), d.getMimeType())).orElse(null);
    }

    private static String addressOf(Map<String, Object> details, Property listing) {
        Map<String, Object> prop = propOf(details);
        String address = Stream.of(prop.get("flatNo"), prop.get("society"), prop.get("locality"), prop.get("city"),
                        prop.get("pincode")).map(RentAgreementHomes::text).filter(Objects::nonNull)
                .collect(Collectors.joining(", "));
        if (address.isEmpty() && listing != null) {
            address = listing.getTitle() + ", " + listing.getLocality();
        }
        address = address.isEmpty() ? "Rented home" : address;
        return address.length() > MAX_ADDRESS ? address.substring(0, MAX_ADDRESS) : address;
    }

    private static Map<String, Object> propOf(Map<String, Object> details) {
        return ServiceRequestPricing.childObject(ServiceRequestPricing.childObject(details, "_state"), "prop");
    }

    private static String text(Object value) {
        return value == null || value.toString().isBlank() ? null : value.toString().strip();
    }

    private static BigDecimal number(Object value) {
        try {
            BigDecimal n = value == null ? null : new BigDecimal(value.toString().strip());
            return n == null || n.signum() <= 0 ? null : n;
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
