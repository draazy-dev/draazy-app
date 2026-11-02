package com.draazy.api.services.request;

import com.draazy.api.catalog.managed.ManagedProperty;
import com.draazy.api.catalog.managed.ManagedPropertyRepository;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Ids;
import com.draazy.api.documents.agreement.RentAgreement;
import com.draazy.api.documents.agreement.RentAgreementRepository;
import com.draazy.api.documents.agreement.RentAgreementStatuses;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RentAgreementRenewalPrefill {
    public record Party(String name, String mobile) {
    }

    public record Prefill(String propertyId, String serviceRequestId, Long rent, Long deposit,
            Integer months, LocalDate startDate, Party owner, List<Party> tenants, Map<String, String> prop) {
    }

    // Address fields only: the wizard's prop block also carries identity numbers that must not travel.
    private static final List<String> PROP_KEYS = List.of("propType", "flatNo", "society", "societyId", "locality",
            "city", "taluka", "landmark", "policeStation", "roadVicinity", "roadType", "pincode", "area",
            "areaUnit", "floor");

    private final RentAgreementRepository agreements;
    private final ServiceRequestRepository requests;
    private final UserRepository users;
    private final ManagedPropertyRepository homes;

    public RentAgreementRenewalPrefill(RentAgreementRepository agreements,
            ServiceRequestRepository requests, UserRepository users, ManagedPropertyRepository homes) {
        this.agreements = agreements;
        this.requests = requests;
        this.users = users;
        this.homes = homes;
    }

    @Transactional(readOnly = true)
    public Prefill forCaller(UUID callerId, String agreementId) {
        RentAgreement agreement = Ids.parseUuid(agreementId).flatMap(agreements::findById)
                .filter(RentAgreementRenewalPrefill::signed)
                .filter(a -> isParty(callerId, a))
                .orElseThrow(() -> NotFoundException.of("Rent agreement"));
        User owner = users.findById(agreement.getOwnerId()).orElseThrow(() -> NotFoundException.of("Rent agreement"));

        List<RentAgreement> signed = agreement.getServiceRequestId() == null
                ? List.of(agreement)
                : agreements.findByServiceRequestIdOrderByCreatedAtAsc(agreement.getServiceRequestId()).stream()
                        .filter(RentAgreementRenewalPrefill::signed)
                        .toList();
        Optional<ServiceRequest> request = Optional.ofNullable(agreement.getServiceRequestId())
                .flatMap(requests::findById);
        Map<String, String> formNames = request.map(RentAgreementRegistration::formTenants).orElse(Map.of());
        LocalDate end = agreement.endDate();
        return new Prefill(agreement.getPropertyId().toString(),
                Objects.toString(agreement.getServiceRequestId(), null),
                agreement.getRent(), agreement.getDeposit(), agreement.getDurationMonths(),
                end == null ? null : end.plusDays(1),
                new Party(owner.getName(), owner.getMobile()),
                signed.stream().map(a -> new Party(nameOf(a.getTenantMobile(), formNames), a.getTenantMobile())).toList(),
                request.map(RentAgreementRenewalPrefill::propOf).orElse(null));
    }

    @Transactional(readOnly = true)
    public Prefill forHome(UUID callerId, String homeId) {
        ManagedProperty home = Ids.parseUuid(homeId).flatMap(homes::findById)
                .filter(h -> h.isRented() && h.getAgreementRequestId() != null)
                .filter(h -> callerId.equals(h.getOwnerId()) || isTenant(callerId, h.getTenantMobile()))
                .orElseThrow(() -> NotFoundException.of("Rented home"));
        User owner = users.findById(home.getOwnerId()).orElseThrow(() -> NotFoundException.of("Rented home"));
        Optional<ServiceRequest> request = requests.findById(home.getAgreementRequestId());
        Map<String, Object> details = request.map(ServiceRequest::getDetails).orElse(Map.of());
        Long months = ServiceRequestPricing.rupees(details.get("months"), ServiceRequestPricing.childObject(
                ServiceRequestPricing.childObject(details, "_state"), "terms").get("months"));
        Map<String, String> named = request.map(RentAgreementRegistration::formTenants).orElse(Map.of());
        List<Party> tenants = named.isEmpty() && home.getTenantMobile() != null
                ? List.of(new Party(home.getTenantName(), home.getTenantMobile()))
                : named.keySet().stream().map(mobile -> new Party(nameOf(mobile, named), mobile)).toList();
        return new Prefill(Objects.toString(home.getPublishedListingId(), null),
                home.getAgreementRequestId().toString(), home.getMonthlyRent(), home.getDeposit(),
                months == null ? null : months.intValue(), home.getLeaseEnd(),
                new Party(owner.getName(), owner.getMobile()), tenants,
                request.map(RentAgreementRenewalPrefill::propOf).orElse(null));
    }

    private static Map<String, String> propOf(ServiceRequest request) {
        Map<String, Object> details = request.getDetails() == null ? Map.of() : request.getDetails();
        Map<String, Object> prop = ServiceRequestPricing.childObject(
                ServiceRequestPricing.childObject(details, "_state"), "prop");
        Map<String, String> out = new LinkedHashMap<>();
        PROP_KEYS.forEach(key -> {
            if (prop.get(key) instanceof String value && !value.isBlank()) {
                out.put(key, value);
            }
        });
        return out;
    }

    private static boolean signed(RentAgreement agreement) {
        return RentAgreementStatuses.REGISTERED.equals(agreement.getStatus())
                || RentAgreementStatuses.ACTIVE.equals(agreement.getStatus());
    }

    private boolean isParty(UUID callerId, RentAgreement agreement) {
        return callerId.equals(agreement.getOwnerId()) || isTenant(callerId, agreement.getTenantMobile());
    }

    private boolean isTenant(UUID callerId, String tenantMobile) {
        String expected = MobileMask.normalise(tenantMobile);
        return expected != null && users.findById(callerId)
                .filter(User::isMobileVerified)
                .map(u -> MobileMask.normalise(u.getMobile()))
                .filter(expected::equals)
                .isPresent();
    }

    private String nameOf(String mobile, Map<String, String> formNames) {
        String typed = formNames.get(mobile);
        return typed != null ? typed : users.findByMobile(mobile).map(User::getName).orElse(null);
    }
}
