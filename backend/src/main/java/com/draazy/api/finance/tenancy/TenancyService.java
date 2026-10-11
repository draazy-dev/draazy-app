package com.draazy.api.finance.tenancy;

import com.draazy.api.common.PlatformTime;
import com.draazy.api.common.error.ConflictException;
import com.draazy.api.common.error.NotFoundException;
import com.draazy.api.common.trust.MobileMask;
import com.draazy.api.common.trust.Notifier;
import com.draazy.api.identity.user.User;
import com.draazy.api.identity.user.UserRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TenancyService {

    private final TenancyRepository tenancies;
    private final UserRepository users;
    private final Notifier notifier;

    public TenancyService(TenancyRepository tenancies, UserRepository users, Notifier notifier) {
        this.tenancies = tenancies;
        this.users = users;
        this.notifier = notifier;
    }

    @Transactional(readOnly = true)
    public List<TenancyDto> myTenancies(UUID callerId) {
        return project(tenancies.findByTenantId(callerId));
    }

    // A close only proposes the tenancy: it activates when the named tenant confirms it.
    @Transactional
    public Optional<Tenancy> openFromClosedDeal(UUID propertyId, UUID ownerId, UUID tenantId,
                                                String tenantMobile, Long monthlyRent) {
        if (tenantId == null || tenantId.equals(ownerId)) {
            return Optional.empty();
        }
        tenancies.declinePendingByPropertyId(propertyId);
        Optional<Tenancy> existing = tenancies.findActiveByPropertyId(propertyId);
        if (existing.isPresent()) {
            return existing;
        }
        Tenancy tenancy = new Tenancy(propertyId, tenantId, ownerId, tenantMobile);
        tenancy.setRent(monthlyRent);
        tenancy.setStatus(TenancyStatuses.PENDING);
        tenancy = tenancies.save(tenancy);
        notifier.notify(tenantId, "tenancy.pending", "Confirm your tenancy",
                "A landlord has named you as their tenant. Confirm it if it is right, or decline it.",
                "/dashboard#rental");
        return Optional.of(tenancy);
    }

    @Transactional
    public TenancyDto confirm(UUID callerId, UUID tenancyId) {
        Tenancy tenancy = requireNamedTenant(callerId, tenancyId);
        if (!TenancyStatuses.PENDING.equals(tenancy.getStatus())) {
            throw new ConflictException("This tenancy is no longer waiting for confirmation");
        }
        if (tenancies.findActiveByPropertyId(tenancy.getPropertyId()).isPresent()) {
            throw new ConflictException("This property already has an active tenancy");
        }
        if (tenancies.activatePending(tenancyId, LocalDate.now(PlatformTime.IST)) == 0) {
            throw new ConflictException("This tenancy is no longer waiting for confirmation");
        }
        return reload(tenancyId);
    }

    @Transactional
    public TenancyDto decline(UUID callerId, UUID tenancyId) {
        Tenancy tenancy = requireNamedTenant(callerId, tenancyId);
        if (!TenancyStatuses.PENDING.equals(tenancy.getStatus())) {
            throw new ConflictException("This tenancy is no longer waiting for confirmation");
        }
        if (tenancies.declinePending(tenancyId) == 0) {
            throw new ConflictException("This tenancy is no longer waiting for confirmation");
        }
        return reload(tenancyId);
    }

    private TenancyDto reload(UUID tenancyId) {
        return project(List.of(tenancies.findById(tenancyId).orElseThrow())).get(0);
    }

    // Anyone but the account the owner named is a 404, so the id is never confirmed to exist.
    private Tenancy requireNamedTenant(UUID callerId, UUID tenancyId) {
        Tenancy tenancy = tenancies.findById(tenancyId)
                .filter(t -> t.getTenantId().equals(callerId))
                .orElseThrow(() -> NotFoundException.of("Tenancy"));
        User caller = users.findById(callerId).orElseThrow(() -> NotFoundException.of("Tenancy"));
        String named = MobileMask.normalise(tenancy.getTenantMobile());
        if (!caller.isMobileVerified() || named == null
                || !named.equals(MobileMask.normalise(caller.getMobile()))) {
            throw NotFoundException.of("Tenancy");
        }
        return tenancy;
    }

    // Pending is declined before active is ended: a confirm that lands between the two is still ended.
    @Transactional
    public void endActiveTenancy(UUID propertyId) {
        tenancies.declinePendingByPropertyId(propertyId);
        tenancies.endActiveByPropertyId(propertyId, LocalDate.now(PlatformTime.IST));
    }
    // Resolve participants in one query so this otherwise-simple read avoids N+1.
    private List<TenancyDto> project(List<Tenancy> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        Set<UUID> userIds = new HashSet<>();
        for (Tenancy tenancy : rows) {
            userIds.add(tenancy.getTenantId());
            userIds.add(tenancy.getOwnerId());
        }
        Map<UUID, User> byId = users.findAllById(userIds).stream()
                .collect(Collectors.toMap(User::getId, Function.identity()));

        List<TenancyDto> out = new ArrayList<>(rows.size());
        for (Tenancy tenancy : rows) {
            out.add(TenancyMapper.toDto(
                    tenancy, byId.get(tenancy.getTenantId()), byId.get(tenancy.getOwnerId())));
        }
        return out;
    }
}
