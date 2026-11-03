package com.draazy.api.catalog.managed;

import com.draazy.api.catalog.listing.ListingCreate;
import com.draazy.api.catalog.listing.ListingService;
import com.draazy.api.catalog.locality.LocalityBinding;
import com.draazy.api.catalog.property.AvailableOn;
import com.draazy.api.catalog.property.DealIntent;
import com.draazy.api.catalog.property.Property;
import com.draazy.api.catalog.property.PropertyRepository;
import com.draazy.api.catalog.society.SocietyReference;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.error.ValidationException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Ids;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ManagedPropertyService {
    private static final String CITY = "Pune";

    private final ManagedPropertyRepository records;
    private final ManagedRentReceiptRepository receipts;
    private final ManagedPropertyMapper mapper;
    private final LocalityBinding localities;
    private final ListingService listingService;
    private final PropertyRepository properties;
    private final UserRepository users;
    private final Validator validator;
    private final SocietyReference societyReference;
    private final TrackedRentService trackedRent;

    public ManagedPropertyService(ManagedPropertyRepository records,
            ManagedRentReceiptRepository receipts, ManagedPropertyMapper mapper,
            LocalityBinding localities, ListingService listingService,
            PropertyRepository properties, UserRepository users, Validator validator,
            SocietyReference societyReference, TrackedRentService trackedRent) {
        this.records = records;
        this.receipts = receipts;
        this.mapper = mapper;
        this.localities = localities;
        this.listingService = listingService;
        this.properties = properties;
        this.users = users;
        this.validator = validator;
        this.societyReference = societyReference;
        this.trackedRent = trackedRent;
    }

    @Transactional(readOnly = true)
    public List<ManagedPropertyDto> list(UUID ownerId) {
        return mapper.toDtos(records.findByOwnerIdOrderByCreatedAtDescIdDesc(ownerId));
    }

    @Transactional(readOnly = true)
    public ManagedPropertyDto get(UUID ownerId, String id) {
        return mapper.toDto(ownedRecord(ownerId, id));
    }

    @Transactional
    public ManagedPropertyDto register(UUID ownerId, ManagedPropertyCreateRequest in) {
        LocalityBinding.Bound locality = localities.require(in.localitySlug(), in.locality());
        String title = (in.title() == null || in.title().isBlank())
                ? synthTitle(in.bhk(), in.propertyType(), locality.name())
                : in.title().trim();

        ManagedProperty m = new ManagedProperty(ownerId, title, in.deal(), in.propertyType(),
                in.bhk(), in.price(), locality.name(), locality.slug(), societyReference.nameOf(in.societyId()), in.area(), in.areaUnit(),
                in.furnishing());
        m.setRented(Boolean.TRUE.equals(in.rented()));
        m.setTenantName(trimmed(in.tenantName()));
        boolean named = m.setTenantMobile(MobileMask.normalise(in.tenantMobile()));
        m.setMonthlyRent(in.monthlyRent() != null ? in.monthlyRent()
                : (DealIntent.RENT.equals(in.deal()) ? in.price() : null));
        m.setDueDay(in.dueDay());
        m.setValuation(in.valuation());
        if (m.isRented()) {
            requireTrackable(ownerId, m);
        }
        if (in.publishedListingId() != null && !in.publishedListingId().isBlank()) {
            m.markPublished(adopt(ownerId, in.publishedListingId()));
        }
        return announced(records.saveAndFlush(m), named);
    }

    private ManagedPropertyDto announced(ManagedProperty saved, boolean named) {
        if (named && saved.isRented()) {
            trackedRent.announceTenant(saved);
        }
        return mapper.toDto(saved);
    }

    // A rental closed on a listing published from this record starts tracking that tenant's rent.
    // Not @Transactional: the deal close isolates it in a savepoint, and a throwing proxy would doom that transaction.
    public void fillFromClosedRental(UUID ownerId, UUID listingId, User tenant, long monthlyRent) {
        String name = trimmed(tenant.getName());
        if (name == null || name.isEmpty() || monthlyRent <= 0 || monthlyRent > ManagedProperty.MAX_MONTHLY_RENT) {
            return;
        }
        records.findByPublishedListingId(listingId)
                .filter(m -> m.getOwnerId().equals(ownerId))
                .ifPresent(m -> {
                    m.setRented(true);
                    m.setTenantName(name);
                    boolean named = m.setTenantMobile(MobileMask.normalise(tenant.getMobile()));
                    m.setMonthlyRent(monthlyRent);
                    announced(records.saveAndFlush(m), named);
                });
    }

    private UUID adopt(UUID ownerId, String listingId) {
        Property listing = Ids.parseUuid(listingId)
                .flatMap(properties::findById)
                .filter(p -> p.getOwner() != null && ownerId.equals(p.getOwner().getId()))
                .orElseThrow(() -> NotFoundException.of("Property"));
        if (records.findByPublishedListingId(listing.getId()).isPresent()) {
            throw new ConflictException("That listing already has a managed record.");
        }
        return listing.getId();
    }

    @Transactional
    public ManagedPropertyDto update(UUID ownerId, String id, ManagedPropertyUpdateRequest in) {
        ManagedProperty m = ownedRecord(ownerId, id);
        if (in.title() != null) {
            m.setTitle(in.title());
        }
        if (in.deal() != null) {
            m.setDeal(in.deal());
        }
        if (in.propertyType() != null) {
            m.setPropertyType(in.propertyType());
        }
        if (in.bhk() != null) {
            m.setBhk(in.bhk());
        }
        if (in.price() != null) {
            m.setPrice(in.price());
        }
        boolean renamed = in.locality() != null && !in.locality().equals(m.getLocality());
        boolean repicked = in.localitySlug() != null && !in.localitySlug().equals(m.getLocalitySlug());
        if (renamed || repicked) {
            LocalityBinding.Bound locality = localities.require(in.localitySlug(),
                    in.locality() != null ? in.locality() : m.getLocality(), m.getLocalitySlug());
            m.setLocality(locality.name());
            m.setLocalitySlug(locality.slug());
        }
        if (in.societyId() != null) {
            m.setSociety(societyReference.nameOf(in.societyId()));
        }
        if (in.area() != null) {
            m.setArea(in.area());
        }
        if (in.areaUnit() != null) {
            m.setAreaUnit(in.areaUnit());
        }
        if (in.furnishing() != null) {
            m.setFurnishing(in.furnishing());
        }
        if (in.rented() != null) {
            m.setRented(in.rented());
        }
        if (in.tenantName() != null) {
            m.setTenantName(trimmed(in.tenantName()));
        }
        boolean named = in.tenantMobile() != null && m.setTenantMobile(MobileMask.normalise(in.tenantMobile()));
        if (in.monthlyRent() != null) {
            m.setMonthlyRent(in.monthlyRent());
        }
        if (in.dueDay() != null) {
            m.setDueDay(in.dueDay());
        }
        if (in.valuation() != null) {
            m.setValuation(in.valuation());
        }
        if (in.landlordPan() != null) {
            m.setLandlordPan(in.landlordPan().isEmpty() ? null : in.landlordPan());
        }
        boolean rentTouched = in.rented() != null || in.tenantName() != null || in.tenantMobile() != null
                || in.monthlyRent() != null || in.dueDay() != null;
        if (rentTouched && m.isRented()) {
            requireTrackable(ownerId, m);
        }
        return announced(records.saveAndFlush(m), named);
    }

    @Transactional
    public ManagedPropertyDto stopRentTracking(UUID ownerId, String id) {
        ManagedProperty m = ownedRecord(ownerId, id);
        m.setRented(false);
        m.setTenantName(null);
        m.setTenantMobile(null);
        m.setMonthlyRent(null);
        m.setDueDay(null);
        return mapper.toDto(records.saveAndFlush(m));
    }

    private void requireTrackable(UUID ownerId, ManagedProperty m) {
        if (m.getTenantName() == null || m.getTenantName().isBlank()) {
            throw new ValidationException("Add the tenant's full name");
        }
        if (m.getTenantMobile() == null) {
            throw new ValidationException("Add the tenant's 10-digit mobile number");
        }
        if (users.findById(ownerId).map(User::getMobile).filter(m.getTenantMobile()::equals).isPresent()) {
            throw new ValidationException("The tenant's mobile can't be your own number");
        }
        if (m.getMonthlyRent() == null || m.getMonthlyRent() <= 0) {
            throw new ValidationException("Set a monthly rent above zero");
        }
        if (m.getMonthlyRent() > ManagedProperty.MAX_MONTHLY_RENT) {
            throw new ValidationException("Rent can't be more than ₹1,00,00,000 a month");
        }
    }

    private static String trimmed(String s) {
        return s == null ? null : s.trim();
    }

    @Transactional
    public void delete(UUID ownerId, String id) {
        records.delete(ownedRecord(ownerId, id));
    }

    @Transactional
    public ManagedPropertyDto publish(UUID ownerId, String id) {
        ManagedProperty m = ownedRecordForUpdate(ownerId, id);
        if (m.getPublishedListingId() != null) {
            return mapper.toDto(m);
        }
        ListingCreate listing = new ListingCreate(
                m.getTitle(), m.getDeal(), m.getPropertyType(), m.getBhk(), m.getPrice(),
                null, null, null, m.getArea(), m.getAreaUnit(), m.getFurnishing(),
                m.getLocality(), m.getLocalitySlug(), CITY, null, null, null, null, null, null, null,

                null, null, null,

                null, null, null, null,

                null, null, null, null, null, null, null,

                null, null, null, null, null, availableOn(m), null, null, null);

        Set<ConstraintViolation<ListingCreate>> violations = validator.validate(listing);
        if (!violations.isEmpty()) {
            throw new ConstraintViolationException(violations);
        }
        Property created = listingService.createWithinAllowance(ownerId, listing, m.getLocalitySlug());
        m.markPublished(created.getId());
        return mapper.toDto(records.saveAndFlush(m));
    }

    @Transactional
    public Property publishWith(UUID ownerId, String id, ListingCreate body) {
        ManagedProperty m = ownedRecordForUpdate(ownerId, id);
        if (m.getAddressFingerprint() == null) {
            throw NotFoundException.of("Managed property");
        }
        if (m.getPublishedListingId() != null) {
            throw new ConflictException("This home is already listed.");
        }
        Property created = listingService.create(ownerId, body);
        m.markPublished(created.getId());
        records.saveAndFlush(m);
        return created;
    }

    // A tenanted home goes back on the market from the day the lease ends, within the rent horizon.
    private static String availableOn(ManagedProperty m) {
        LocalDate end = m.getLeaseEnd();
        LocalDate today = AvailableOn.today();
        return m.isRented() && end != null && end.isAfter(today)
                && !end.isAfter(today.plusDays(AvailableOn.MAX_RENT_DAYS_AHEAD)) ? end.toString() : null;
    }

    // Row lock so two concurrent publishes of one record cannot both see it unpublished.
    private ManagedProperty ownedRecordForUpdate(UUID ownerId, String id) {
        return Ids.parseUuid(id)
                .flatMap(records::findByIdForUpdate)
                .filter(m -> m.getOwnerId().equals(ownerId))
                .orElseThrow(() -> NotFoundException.of("Managed property"));
    }

    private ManagedProperty ownedRecord(UUID ownerId, String id) {
        return Ids.parseUuid(id)
                .flatMap(records::findById)
                .filter(m -> m.getOwnerId().equals(ownerId))
                .orElseThrow(() -> NotFoundException.of("Managed property"));
    }

    private static final int MAX_RECEIPT_MONTHS = 24;

    private static final int DEFAULT_RECEIPT_MONTHS = 6;

    private static final int RECEIPT_BACKDATE_YEARS = 5;

    @Transactional(readOnly = true)
    public List<ManagedRentReceiptDto> listRentReceipts(UUID ownerId, String id, Integer months) {
        ManagedProperty m = ownedRecord(ownerId, id);
        int limit = months == null ? DEFAULT_RECEIPT_MONTHS : Math.clamp(months, 1, MAX_RECEIPT_MONTHS);
        return mapper.toReceiptDtos(
                receipts.findByManagedPropertyIdOrderByRentMonthDesc(m.getId(), Limit.of(limit)));
    }

    @Transactional
    public ManagedRentReceiptDto recordRentReceipt(UUID ownerId, String id, String rentMonth) {
        ManagedProperty m = ownedRecord(ownerId, id);
        requireReceiptableMonth(rentMonth);
        if (!m.isRented()) {
            throw new ValidationException("Turn on rent tracking for this property first");
        }
        Long rent = m.getMonthlyRent();
        if (rent == null || rent <= 0) {
            throw new ValidationException("Set a monthly rent for this property first");
        }
        if (m.getTenantName() == null || m.getTenantName().isBlank()) {
            throw new ValidationException("Add the tenant's name for this property first");
        }
        if (receipts.existsByManagedPropertyIdAndRentMonth(m.getId(), rentMonth)) {
            throw new ConflictException("Rent for " + rentMonth + " is already recorded");
        }
        User owner = users.findById(ownerId).orElseThrow(() -> NotFoundException.of("Owner"));
        String landlord = owner.getName() == null || owner.getName().isBlank()
                ? "Owner"
                : owner.getName().trim();
        ManagedRentReceipt receipt = receipts.saveAndFlush(new ManagedRentReceipt(m, rentMonth, landlord));
        trackedRent.announceReceipt(m, rentMonth);
        return mapper.toDto(receipt);
    }

    private static void requireReceiptableMonth(String rentMonth) {
        YearMonth now = YearMonth.now(ZoneId.of("Asia/Kolkata"));
        if (rentMonth.compareTo(now.toString()) > 0) {
            throw new ValidationException("You can't record rent for a month that hasn't happened yet");
        }
        if (rentMonth.compareTo(now.minusYears(RECEIPT_BACKDATE_YEARS).toString()) < 0) {
            throw new ValidationException(
                    "You can only record the last " + RECEIPT_BACKDATE_YEARS + " years of rent");
        }
    }

    static String synthTitle(BigDecimal bhk, String type, String locality) {
        String bhkLabel = "";
        if (bhk != null && bhk.signum() > 0) {
            int n = bhk.intValue();
            bhkLabel = (n >= 5 ? "5+ BHK" : n + " BHK") + " ";
        }
        String t = (type == null || type.isBlank()) ? "Property" : type.trim();
        String loc = (locality == null || locality.isBlank()) ? "" : " in " + locality.trim();
        return bhkLabel + t + loc;
    }
}
