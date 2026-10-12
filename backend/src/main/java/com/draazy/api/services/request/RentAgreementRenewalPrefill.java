package com.draazy.api.services.request;

import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.web.Ids;
import com.draazy.api.documents.agreement.RentAgreement;
import com.draazy.api.documents.agreement.RentAgreementRepository;
import com.draazy.api.documents.agreement.RentAgreementStatuses;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** What the renewal wizard prefills from. Both parties signed the same registered document, so each
 * may see the other's mobile; a stranger and a draft get 404, never 403. */
@Service
public class RentAgreementRenewalPrefill {

    public record Party(String name, String mobile) {
    }

    public record Prefill(String propertyId, String serviceRequestId, Long rent, Long deposit,
            Integer months, LocalDate startDate, Party owner, List<Party> tenants) {
    }

    private final RentAgreementRepository agreements;
    private final ServiceRequestRepository requests;
    private final UserRepository users;

    public RentAgreementRenewalPrefill(RentAgreementRepository agreements,
            ServiceRequestRepository requests, UserRepository users) {
        this.agreements = agreements;
        this.requests = requests;
        this.users = users;
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
        Map<String, String> formNames = agreement.getServiceRequestId() == null ? Map.of()
                : requests.findById(agreement.getServiceRequestId())
                        .map(RentAgreementRegistration::formTenants).orElse(Map.of());
        LocalDate end = agreement.endDate();
        return new Prefill(agreement.getPropertyId().toString(),
                Objects.toString(agreement.getServiceRequestId(), null),
                agreement.getRent(), agreement.getDeposit(), agreement.getDurationMonths(),
                end == null ? null : end.plusDays(1),
                new Party(owner.getName(), owner.getMobile()),
                signed.stream().map(a -> new Party(nameOf(a.getTenantMobile(), formNames), a.getTenantMobile())).toList());
    }

    private static boolean signed(RentAgreement agreement) {
        return RentAgreementStatuses.REGISTERED.equals(agreement.getStatus())
                || RentAgreementStatuses.ACTIVE.equals(agreement.getStatus());
    }

    private boolean isParty(UUID callerId, RentAgreement agreement) {
        if (callerId.equals(agreement.getOwnerId())) {
            return true;
        }
        return users.findById(callerId)
                .filter(User::isMobileVerified)
                .map(u -> MobileMask.normalise(u.getMobile()))
                .filter(mobile -> mobile != null && mobile.equals(agreement.getTenantMobile()))
                .isPresent();
    }

    private String nameOf(String mobile, Map<String, String> formNames) {
        String typed = formNames.get(mobile);
        return typed != null ? typed : users.findByMobile(mobile).map(User::getName).orElse(null);
    }
}
